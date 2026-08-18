import { describe, expect, it } from "vitest";
import { mergeUserStates } from "./merge";

describe("mergeUserStates", () => {
  it("unites favorites and comparisons without duplicates", () => {
    const merged = mergeUserStates(
      { favoriteIds: ["hse"], comparisonIds: ["mipt"], scoreSets: [] },
      { favoriteIds: ["hse", "msu"], comparisonIds: ["mipt", "msu"], scoreSets: [] },
    );
    expect(merged.favoriteIds).toEqual(["hse", "msu"]);
    expect(merged.comparisonIds).toEqual(["mipt", "msu"]);
  });

  it("keeps the newest version of a score profile", () => {
    const base = { id: "main", name: "Основной", scores: { Математика: 80 }, individualAchievements: 0 };
    const merged = mergeUserStates(
      { favoriteIds: [], comparisonIds: [], scoreSets: [{ ...base, updatedAt: "2026-08-18T12:00:00.000Z" }] },
      { favoriteIds: [], comparisonIds: [], scoreSets: [{ ...base, scores: { Математика: 91 }, updatedAt: "2026-08-19T12:00:00.000Z" }] },
    );
    expect(merged.scoreSets[0].scores.Математика).toBe(91);
  });
});
