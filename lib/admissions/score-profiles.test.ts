import { describe, expect, it } from "vitest";
import { selectScoreProfile } from "./score-profiles";
import type { ScoreSet } from "./types";

const saved: ScoreSet = {
  id: "saved-profile",
  name: "Мой первый набор",
  scores: { "Русский язык": 97, Литература: 86 },
  individualAchievements: 7,
  additionalExamScores: { "creative-exam": 95 },
  updatedAt: "2026-10-09T20:00:00.000Z",
};

describe("saved score profile selection", () => {
  it("starts a separate draft after a saved profile without overwriting its scores", () => {
    const draft = selectScoreProfile("draft", [saved])!;
    expect(draft.id).toBe("draft");
    expect(draft.name).toBe("Мой набор");
    expect(draft.scores).not.toEqual(saved.scores);
    expect(draft.additionalExamScores).toBeUndefined();
    draft.scores["Русский язык"] = 50;
    expect(saved.scores["Русский язык"]).toBe(97);
    expect(saved.id).toBe("saved-profile");
    expect(selectScoreProfile("draft", [saved])!.scores["Русский язык"]).toBe(
      80,
    );
  });

  it("restores every saved exam field and ignores stale selection ids", () => {
    expect(selectScoreProfile(saved.id, [saved])).toBe(saved);
    expect(selectScoreProfile("removed-profile", [saved])).toBeUndefined();
  });
});
