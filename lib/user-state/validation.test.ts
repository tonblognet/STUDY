import { describe, expect, it } from "vitest";
import {
  normalizeUserState,
  userStateSchema,
  scoreSetSchema,
} from "./validation";

describe("user state validation", () => {
  it("retains program-specific creative scores and rejects invalid values", () => {
    const profile = {
      id: "main",
      name: "Creative",
      scores: {},
      individualAchievements: 0,
      updatedAt: "2026-09-22T00:00:00.000Z",
      additionalExamScores: {
        "program:creative": 80,
        "program:professional": 90,
      },
    };
    expect(scoreSetSchema.parse(profile).additionalExamScores).toEqual(
      profile.additionalExamScores,
    );
    for (const invalid of [-1, 101, 10.5, Infinity, NaN])
      expect(
        scoreSetSchema.safeParse({
          ...profile,
          additionalExamScores: { "program:creative": invalid },
        }).success,
      ).toBe(false);
  });
  it("rejects impossible scores", () => {
    const result = userStateSchema.safeParse({
      favoriteIds: [],
      comparisonIds: [],
      scoreSets: [
        {
          id: "main",
          name: "Основной",
          scores: { Математика: 101 },
          individualAchievements: 0,
          updatedAt: "2026-08-19T12:00:00.000Z",
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("removes duplicate and unknown program ids", () => {
    const result = normalizeUserState(
      {
        favoriteIds: ["hse", "hse", "unknown"],
        comparisonIds: ["mipt", "unknown"],
        scoreSets: [],
      },
      new Set(["hse", "mipt"]),
    );
    expect(result.favoriteIds).toEqual(["hse"]);
    expect(result.comparisonIds).toEqual(["mipt"]);
  });
});
