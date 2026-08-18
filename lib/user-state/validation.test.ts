import { describe, expect, it } from "vitest";
import { normalizeUserState, userStateSchema } from "./validation";

describe("user state validation", () => {
  it("rejects impossible scores", () => {
    const result = userStateSchema.safeParse({
      favoriteIds: [], comparisonIds: [],
      scoreSets: [{ id: "main", name: "Основной", scores: { Математика: 101 }, individualAchievements: 0, updatedAt: "2026-08-19T12:00:00.000Z" }],
    });
    expect(result.success).toBe(false);
  });

  it("removes duplicate and unknown program ids", () => {
    const result = normalizeUserState(
      { favoriteIds: ["hse", "hse", "unknown"], comparisonIds: ["mipt", "unknown"], scoreSets: [] },
      new Set(["hse", "mipt"]),
    );
    expect(result.favoriteIds).toEqual(["hse"]);
    expect(result.comparisonIds).toEqual(["mipt"]);
  });
});
