import { beforeEach, describe, expect, it, vi } from "vitest";
import { accountRequest } from "./client";
import { applyTrackerChange, commitTrackerChange } from "./tracker-client";
import type { TrackerItem } from "./tracker";

vi.mock("./client", () => ({ accountRequest: vi.fn() }));

const item: TrackerItem = {
  id: "ckl3m0h1x0000qzrmn831i7rn",
  version: 1,
  priority: 1,
  stage: "shortlist",
  documentsReady: false,
  consentReady: false,
  deadlineAt: null,
  notes: "Моя заметка",
  programKey: "hse-economics",
  admissionYear: 2027,
  history: [],
};

describe("tracker mutation acknowledgements", () => {
  beforeEach(() => {
    vi.mocked(accountRequest).mockReset();
  });

  it("uses the acknowledged version for the next edit without a second request", async () => {
    vi.mocked(accountRequest).mockResolvedValue({
      item: { ...item, version: 2, stage: "documents" },
    });
    const update = { ...item, stage: "documents" };
    const change = await commitTrackerChange("PATCH", update);
    const saved = applyTrackerChange([item], change);
    expect(saved[0].version).toBe(2);
    expect(saved[0].stage).toBe("documents");
    expect(accountRequest).toHaveBeenCalledExactlyOnceWith(
      "/api/tracker",
      "PATCH",
      update,
    );

    vi.mocked(accountRequest).mockResolvedValue({
      item: { ...saved[0], version: 3, notes: "Второе изменение" },
    });
    const next = { ...saved[0], notes: "Второе изменение" };
    await commitTrackerChange("PATCH", next);
    expect(vi.mocked(accountRequest).mock.calls[1][2]).toMatchObject({
      version: 2,
    });
  });

  it("adds an existing program/year once and preserves other row references", async () => {
    const other = { ...item, id: "other-item", priority: 2 };
    vi.mocked(accountRequest).mockResolvedValue({ item });
    const change = await commitTrackerChange("POST", {
      programKey: item.programKey,
      admissionYear: item.admissionYear,
    });
    const saved = applyTrackerChange([other, item], change);
    expect(saved).toEqual([item, other]);
    expect(saved[1]).toBe(other);
  });

  it("removes only the acknowledged record", async () => {
    const other = { ...item, id: "other-item" };
    vi.mocked(accountRequest).mockResolvedValue({ ok: true });
    const change = await commitTrackerChange("DELETE", {
      id: item.id,
      version: item.version,
    });
    expect(applyTrackerChange([item, other], change)).toEqual([other]);
  });

  it("propagates conflicts without replacing the unsaved row", async () => {
    vi.mocked(accountRequest).mockRejectedValue(new Error("Запись изменилась"));
    await expect(commitTrackerChange("PATCH", item)).rejects.toThrow(
      "Запись изменилась",
    );
    expect(item.notes).toBe("Моя заметка");
    expect(item.version).toBe(1);
  });
});
