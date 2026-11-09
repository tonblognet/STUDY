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

  it("keeps previously saved unavailable programs in their original lists", () => {
    const previous = {
      favoriteIds: ["removed-favorite"],
      comparisonIds: ["removed-comparison"],
      scoreSets: [],
    };
    const result = normalizeUserState(
      {
        favoriteIds: ["removed-favorite", "hse", "unknown", "removed-favorite"],
        comparisonIds: ["removed-comparison", "mipt", "unknown"],
        scoreSets: [],
      },
      new Set(["hse", "mipt"]),
      previous,
    );
    expect(result.favoriteIds).toEqual(["removed-favorite", "hse"]);
    expect(result.comparisonIds).toEqual(["removed-comparison", "mipt"]);
    expect(previous.favoriteIds).toEqual(["removed-favorite"]);
  });

  it("does not add an unavailable program to a different list", () => {
    const result = normalizeUserState(
      {
        favoriteIds: ["removed-comparison"],
        comparisonIds: ["removed-favorite"],
        scoreSets: [],
      },
      new Set(),
      {
        favoriteIds: ["removed-favorite"],
        comparisonIds: ["removed-comparison"],
        scoreSets: [],
      },
    );
    expect(result.favoriteIds).toEqual([]);
    expect(result.comparisonIds).toEqual([]);
  });

  it("allows explicit removal of previously saved unavailable programs", () => {
    const result = normalizeUserState(
      { favoriteIds: [], comparisonIds: [], scoreSets: [] },
      new Set(),
      {
        favoriteIds: ["removed-favorite"],
        comparisonIds: ["removed-comparison"],
        scoreSets: [],
      },
    );
    expect(result.favoriteIds).toEqual([]);
    expect(result.comparisonIds).toEqual([]);
  });
});
