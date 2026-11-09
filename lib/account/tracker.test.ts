import { describe, expect, it } from "vitest";
import { trackerCreateSchema, trackerUpdateSchema } from "./tracker";
const valid = {
  id: "ckl3m0h1x0000qzrmn831i7rn",
  version: 1,
  priority: 1,
  stage: "shortlist",
  documentsReady: false,
  consentReady: false,
  deadlineAt: null,
  notes: "",
};
describe("tracker boundary", () => {
  it("validates each persistent field and requires an optimistic version", () => {
    expect(trackerUpdateSchema.safeParse(valid).success).toBe(true);
    for (const patch of [
      { version: 0 },
      { version: undefined },
      { priority: 0 },
      { priority: 201 },
      { stage: "invented" },
      { deadlineAt: "tomorrow" },
      { notes: "x".repeat(2001) },
      { documentsReady: "yes" },
    ])
      expect(
        trackerUpdateSchema.safeParse({ ...valid, ...patch }).success,
      ).toBe(false);
  });
  it("accepts a personal deadline and a stable public program key", () => {
    expect(
      trackerUpdateSchema.parse({
        ...valid,
        deadlineAt: "2027-07-01T12:00:00.000Z",
      }).deadlineAt,
    ).toBeTruthy();
    expect(
      trackerCreateSchema.safeParse({
        programKey: "hse-economics",
        admissionYear: 2027,
      }).success,
    ).toBe(true);
    expect(
      trackerCreateSchema.safeParse({ programKey: "", admissionYear: 2027 })
        .success,
    ).toBe(false);
  });
});
