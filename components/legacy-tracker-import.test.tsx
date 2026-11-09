import type { FormEvent, ReactElement, ReactNode } from "react";
import { Children, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountRequest } from "@/lib/account/client";
import { LegacyTrackerImport } from "./legacy-tracker-import";

// Invoke real event handlers without adding a DOM implementation dependency.
const hooks = vi.hoisted(() => ({ cursor: 0, values: [] as unknown[] }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useEffect: vi.fn(),
  useState(initial: unknown) {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = initial;
    return [
      hooks.values[index],
      (value: unknown) => {
        hooks.values[index] = value;
      },
    ];
  },
}));
vi.mock("@/lib/account/client", () => ({ accountRequest: vi.fn() }));

const key = "postupai:admission-tracker";
const items = [
  {
    programId: "hse-economics",
    priority: 1,
    stage: "documents",
    documentsReady: true,
    consentReady: false,
  },
];
const raw = JSON.stringify(items);
const values = new Map<string, string>();
const onImported = vi.fn(async () => {});

function render() {
  hooks.cursor = 0;
  return LegacyTrackerImport({ onImported });
}

function element(
  node: ReactNode,
  predicate: (node: ReactElement<Record<string, unknown>>) => boolean,
): ReactElement<Record<string, unknown>> | undefined {
  if (!isValidElement<Record<string, unknown>>(node)) return;
  if (predicate(node)) return node;
  for (const child of Children.toArray(node.props.children as ReactNode)) {
    const found = element(child, predicate);
    if (found) return found;
  }
}

function submit() {
  const form = element(render(), (node) => node.type === "form")!;
  return (
    form.props.onSubmit as (event: FormEvent<HTMLFormElement>) => Promise<void>
  )({
    preventDefault: vi.fn(),
    currentTarget: {} as HTMLFormElement,
  } as unknown as FormEvent<HTMLFormElement>);
}

beforeEach(() => {
  hooks.values = [raw, false, "", ""];
  values.clear();
  values.set(key, raw);
  onImported.mockClear();
  vi.mocked(accountRequest).mockReset().mockResolvedValue({ count: 1 });
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((name: string) => values.get(name) ?? null),
    setItem: vi.fn((name: string, value: string) => values.set(name, value)),
    removeItem: vi.fn((name: string) => values.delete(name)),
  });
  vi.stubGlobal(
    "FormData",
    class {
      get(name: string) {
        return name === "year" ? "2027" : null;
      }
      has(name: string) {
        return name === "owner";
      }
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("legacy tracker copy", () => {
  it("keeps concurrent local changes while an import request is pending", async () => {
    let confirm!: (value: { count: number }) => void;
    vi.mocked(accountRequest).mockReturnValue(
      new Promise((resolve) => {
        confirm = resolve;
      }),
    );
    const pending = submit();
    const changed = JSON.stringify([
      ...items,
      { ...items[0], programId: "new-program" },
    ]);
    values.set(key, changed); // Simulates a write from another tab.
    confirm({ count: 1 });
    await pending;
    expect(accountRequest).toHaveBeenCalledExactlyOnceWith(
      "/api/tracker/import",
      "POST",
      {
        items,
        admissionYear: 2027,
        confirmedOwner: true,
      },
    );
    expect(values.get(key)).toBe(changed);
    expect(localStorage.setItem).not.toHaveBeenCalled();
    expect(localStorage.removeItem).not.toHaveBeenCalled();
    expect(onImported).toHaveBeenCalledOnce();
    const html = renderToStaticMarkup(render());
    expect(html).toContain("Локальная копия остаётся на устройстве");
    expect(html).toContain("Удалить локальную копию маршрута");
    expect(html).toContain("Перенести старый маршрут");
  });

  it("keeps the acknowledged copy and allows an explicit repeated import", async () => {
    await submit();
    await submit();
    expect(accountRequest).toHaveBeenCalledTimes(2);
    expect(values.get(key)).toBe(raw);
    expect(localStorage.removeItem).not.toHaveBeenCalled();
  });

  it("deletes local data only through the separate explicit action", async () => {
    await submit();
    const button = element(
      render(),
      (node) =>
        node.type === "button" &&
        node.props.children === "Удалить локальную копию маршрута",
    )!;
    expect(button.props.disabled).toBe(false);
    (button.props.onClick as () => void)();
    expect(localStorage.removeItem).toHaveBeenCalledExactlyOnceWith(key);
    expect(values.has(key)).toBe(false);
    expect(render()).toBeNull();
    expect(accountRequest).toHaveBeenCalledOnce();
  });

  it("leaves the copy and retry controls intact after a failed import", async () => {
    vi.mocked(accountRequest).mockRejectedValue(new Error("Сервис недоступен"));
    await submit();
    const html = renderToStaticMarkup(render());
    expect(html).toContain("Сервис недоступен");
    expect(html).not.toContain("Перенос завершён");
    expect(values.get(key)).toBe(raw);
    expect(localStorage.removeItem).not.toHaveBeenCalled();
    expect(onImported).not.toHaveBeenCalled();
  });
});
