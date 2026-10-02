import { describe, expect, it } from "vitest";
import { programs } from "@/lib/data";
import { matchProgram } from "./matching";
import { selectScoreSubjects, updateScoreInput } from "./score-input";
import type { ScoreSet } from "./types";

const program = programs.find((item) => item.slug === "hse-economics")!;
const profile: ScoreSet = {
  id: "input-test",
  name: "Input test",
  scores: { Математика: 95, "Русский язык": 95, Информатика: 95 },
  individualAchievements: 0,
  updatedAt: "2026-10-01T12:00:00.000Z",
};

describe("score input reaches the engine without inventing a result", () => {
  it("keeps cleared and newly selected subjects missing when other subjects change", () => {
    const cleared = updateScoreInput(profile.scores, "Математика", "");
    const scores = selectScoreSubjects(cleared, [
      "Математика",
      "Русский язык",
      "Информатика",
      "История",
    ]);
    expect(scores).toEqual({ "Русский язык": 95, Информатика: 95 });
    expect(matchProgram(program, { ...profile, scores }).eligibility).toBe(
      "unknown",
    );
    expect(
      selectScoreSubjects({ Математика: 0, История: 101 }, ["Математика"]),
    ).toEqual({ Математика: 0 });
    expect(selectScoreSubjects({ История: 101 }, ["История"])).toEqual({
      История: 101,
    });
  });

  it("distinguishes a cleared input from an explicit zero", () => {
    const cleared = updateScoreInput(profile.scores, "Математика", "");
    expect(cleared).not.toHaveProperty("Математика");
    expect(profile.scores.Математика).toBe(95);
    expect(
      matchProgram(program, { ...profile, scores: cleared }).eligibility,
    ).toBe("unknown");
    const zero = updateScoreInput(profile.scores, "Математика", "0");
    expect(
      matchProgram(program, { ...profile, scores: zero }).eligibility,
    ).toBe("ineligible");
  });

  it.each(["101", "-1", "80.5", "invalid"])(
    "does not turn invalid input %s into an eligible score",
    (input) => {
      const scores = updateScoreInput(profile.scores, "Математика", input);
      const result = matchProgram(program, { ...profile, scores });
      expect(result.eligibility).toBe("unknown");
      expect(result.consideredScore).toBeNull();
    },
  );
});
