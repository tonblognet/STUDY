import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Program } from "@/lib/data";
import type { TrackerItem } from "@/lib/account/tracker";
import { AdmissionTracker } from "./admission-tracker";

const hooks = vi.hoisted(() => ({ cursor: 0, values: [] as unknown[] }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useEffect: vi.fn(),
  useCallback: (callback: unknown) => callback,
  useState(initial: unknown) {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = initial;
    return [hooks.values[index], vi.fn()];
  },
}));
vi.mock("@/components/user-state-provider", () => ({
  useUserState: () => ({ favoriteIds: [] }),
}));
vi.mock("@/components/legacy-tracker-import", () => ({
  LegacyTrackerImport: () => null,
}));

const program = {
  id: "mai-ami",
  slug: "mai-applied-math",
  title: "Прикладная математика",
  universityShort: "МАИ",
  code: "01.03.02",
  faculty: null,
  form: "Очная",
} as Program;
const item = {
  id: "ckl3m0h1x0000qzrmn831i7rn",
  programKey: program.slug,
  admissionYear: 2027,
  priority: 1,
  stage: "shortlist",
  version: 1,
  documentsReady: false,
  consentReady: false,
  deadlineAt: null,
  notes: "",
  history: [],
} satisfies TrackerItem;

beforeEach(() => {
  hooks.cursor = 0;
  hooks.values = [[item], false, true, false, "", ""];
});

describe("tracker stored program links", () => {
  it("renders the same program for a migrated slug and an earlier public ID", () => {
    hooks.values[0] = [
      item,
      { ...item, id: "second-record", programKey: program.id },
    ];
    const html = renderToStaticMarkup(
      AdmissionTracker({ programs: [program] }),
    );
    expect(html.match(/href="\/programs\/mai-applied-math"/g)).toHaveLength(2);
    expect(html).not.toContain("Программа сейчас отсутствует");
  });

  it("keeps an ambiguous key visible without linking it to the wrong program", () => {
    const collision = { ...program, id: program.slug, slug: "another-program" };
    const html = renderToStaticMarkup(
      AdmissionTracker({ programs: [program, collision] }),
    );
    expect(html).toContain(item.programKey);
    expect(html).toContain("Программа сейчас отсутствует в публичном каталоге");
    expect(html).not.toContain('href="/programs/mai-applied-math"');
    expect(html).not.toContain('href="/programs/another-program"');
  });
});
