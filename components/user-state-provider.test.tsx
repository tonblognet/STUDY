import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "@/lib/admissions/storage";
import { EMPTY_USER_STATE, type UserState } from "@/lib/user-state/types";
import { UserStateProvider, type useUserState } from "./user-state-provider";

// Run the provider's real async actions without a browser or a DOM dependency.
const hooks = vi.hoisted(() => ({
  cursor: 0,
  values: [] as unknown[],
  effect: null as (() => void | (() => void)) | null,
}));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useEffect(effect: () => void | (() => void)) {
    hooks.effect ??= effect;
  },
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
  useRef(initial: unknown) {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = { current: initial };
    return hooks.values[index];
  },
  useCallback: (callback: unknown) => callback,
  useMemo: (factory: () => unknown) => factory(),
}));
vi.mock("@/lib/account/client", () => ({ setAccountIdentity: vi.fn() }));

type Context = ReturnType<typeof useUserState>;
const values = new Map<string, string>();
const fetchMock = vi.fn<typeof fetch>();
const storage = {
  getItem: vi.fn((key: string) => values.get(key) ?? null),
  removeItem: vi.fn((key: string) => values.delete(key)),
  setItem: vi.fn((key: string, value: string) => values.set(key, value)),
};
let cleanup: (() => void) | undefined;

function context(): Context {
  hooks.cursor = 0;
  return (
    UserStateProvider({
      children: null,
      signedIn: true,
      accountId: "account-a",
    }) as ReactElement<{ value: Context }>
  ).props.value;
}

function seedGuest(state: UserState) {
  values.set(STORAGE_KEYS.favorites, JSON.stringify(state.favoriteIds));
  values.set(STORAGE_KEYS.comparison, JSON.stringify(state.comparisonIds));
  values.set(STORAGE_KEYS.scoreSets, JSON.stringify(state.scoreSets));
}

async function initialize(guest: UserState) {
  seedGuest(guest);
  fetchMock.mockResolvedValueOnce(
    Response.json({ state: EMPTY_USER_STATE, version: 0 }),
  );
  context();
  cleanup = hooks.effect!() ?? undefined;
  await vi.waitFor(() => expect(context().storageMode).toBe("account"));
}

const guest: UserState = {
  favoriteIds: ["guest-favorite"],
  comparisonIds: ["guest-comparison"],
  scoreSets: [],
};

beforeEach(() => {
  hooks.cursor = 0;
  hooks.values = [];
  hooks.effect = null;
  cleanup = undefined;
  values.clear();
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("window", {
    localStorage: storage,
    dispatchEvent: vi.fn(),
  });
});
afterEach(() => {
  cleanup?.();
  vi.unstubAllGlobals();
});

describe("account provider guest import", () => {
  it("preserves another tab's complete local copy after the server acknowledges the submitted snapshot", async () => {
    await initialize(guest);
    let acknowledge!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(
      new Promise((resolve) => {
        acknowledge = resolve;
      }),
    );
    context().importGuestData();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const changed = {
      ...guest,
      favoriteIds: [...guest.favoriteIds, "added-in-another-tab"],
    };
    seedGuest(changed);
    const localCopy = new Map(values);
    acknowledge(Response.json({ state: guest, version: 1 }));
    await vi.waitFor(() => expect(context().syncing).toBe(false));

    const request = fetchMock.mock.calls[1][1]!;
    expect(request.headers).toMatchObject({ "x-account-id": "account-a" });
    expect(JSON.parse(request.body as string)).toEqual({
      ...guest,
      version: 0,
    });
    expect(context().favoriteIds).toEqual(guest.favoriteIds);
    expect(context().guestImportMessage).toContain("Локальная копия остаётся");
    expect(context().hasGuestData).toBe(true);
    expect(values).toEqual(localCopy);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it("reports an incomplete server acknowledgement without changing the guest copy", async () => {
    await initialize(guest);
    const localCopy = new Map(values);
    fetchMock.mockResolvedValueOnce(
      Response.json({
        state: { ...guest, comparisonIds: [] },
        version: 1,
      }),
    );
    context().importGuestData();
    await vi.waitFor(() => expect(context().syncing).toBe(false));
    expect(context().guestImportMessage).toContain(
      "Некоторые гостевые данные не перенесены",
    );
    expect(context().comparisonIds).toEqual([]);
    expect(values).toEqual(localCopy);
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it("keeps the guest copy after a conflict and stops further account writes", async () => {
    await initialize(guest);
    const localCopy = new Map(values);
    fetchMock.mockResolvedValueOnce(Response.json({}, { status: 409 }));
    context().importGuestData();
    await vi.waitFor(() => expect(context().syncing).toBe(false));
    expect(context().error).toContain("Данные изменены в другой вкладке");
    expect(context().guestImportMessage).toBeNull();
    context().importGuestData();
    context().toggleFavorite("another-favorite");
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(values).toEqual(localCopy);
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it("clears only the local guest keys through the explicit action after import", async () => {
    await initialize(guest);
    values.set("unrelated-key", "keep");
    fetchMock.mockResolvedValueOnce(
      Response.json({ state: guest, version: 1 }),
    );
    context().importGuestData();
    await vi.waitFor(() => expect(context().syncing).toBe(false));
    context().discardGuestData();
    expect(values).toEqual(new Map([["unrelated-key", "keep"]]));
    expect(storage.removeItem).toHaveBeenCalledTimes(3);
    for (const key of [
      STORAGE_KEYS.favorites,
      STORAGE_KEYS.comparison,
      STORAGE_KEYS.scoreSets,
    ])
      expect(storage.removeItem).toHaveBeenCalledWith(key);
    expect(context().favoriteIds).toEqual(guest.favoriteIds);
    expect(context().comparisonIds).toEqual(guest.comparisonIds);
    expect(context().hasGuestData).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
