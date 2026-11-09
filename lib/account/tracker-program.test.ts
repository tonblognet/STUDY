import { describe, expect, it } from "vitest";
import {
  getTrackerProgramIdentity,
  preferredTrackerItem,
  resolveTrackerProgramKey,
} from "./tracker-program";

const program = { id: "mai-ami", slug: "mai-applied-math" };
const other = { id: "hse-economics", slug: "hse-economics" };
const programs = [program, other];

describe("tracker program identity", () => {
  it("uses the migration-compatible slug while retaining an earlier ID alias", () => {
    expect(getTrackerProgramIdentity(program, programs)).toEqual({
      canonicalKey: "mai-applied-math",
      aliases: ["mai-applied-math", "mai-ami"],
    });
    expect(getTrackerProgramIdentity(other, programs)?.aliases).toEqual([
      "hse-economics",
    ]);
    expect(resolveTrackerProgramKey(program.id, programs)).toBe(program);
    expect(resolveTrackerProgramKey(program.slug, programs)).toBe(program);
  });

  it("does not attribute a stored cross-namespace collision to either program", () => {
    const collision = { id: program.slug, slug: "another-program" };
    const ambiguous = [program, collision];
    expect(getTrackerProgramIdentity(program, ambiguous)).toBeNull();
    expect(getTrackerProgramIdentity(collision, ambiguous)).toBeNull();
    expect(resolveTrackerProgramKey(program.slug, ambiguous)).toBeUndefined();
    expect(resolveTrackerProgramKey(program.id, ambiguous)).toBe(program);
  });

  it("keeps an unknown or removed key unresolved", () => {
    expect(
      resolveTrackerProgramKey("removed-program", programs),
    ).toBeUndefined();
  });

  it("reuses an ID-style record without changing its notes or identity", () => {
    const legacy = { id: "record-a", programKey: program.id, notes: "Keep" };
    const identity = getTrackerProgramIdentity(program, programs)!;
    expect(preferredTrackerItem([legacy], identity)).toBe(legacy);
    expect(legacy).toEqual({
      id: "record-a",
      programKey: program.id,
      notes: "Keep",
    });
  });

  it("prefers the canonical record and preserves pre-existing duplicates", () => {
    const earlier = { id: "record-a", programKey: program.id, notes: "First" };
    const canonical = {
      id: "record-b",
      programKey: program.slug,
      notes: "Second",
    };
    const rows = [earlier, canonical];
    const identity = getTrackerProgramIdentity(program, programs)!;
    expect(preferredTrackerItem(rows, identity)).toBe(canonical);
    expect(preferredTrackerItem([...rows].reverse(), identity)).toBe(canonical);
    expect(rows).toEqual([earlier, canonical]);
    expect(preferredTrackerItem([], identity)).toBeUndefined();
  });
});
