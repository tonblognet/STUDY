import { describe, expect, it } from "vitest";
import { getAdditionalExams } from "../admissions/exams";
import { groupMatches } from "../admissions/matching";
import type { ScoreSet } from "../admissions/types";
import { programs } from "../data";
import { programListItem } from "./program-list";

describe("program list projection", () => {
  it("preserves matching results and links to additional-exam minimums", () => {
    const list = programs.map(programListItem);
    const profile: ScoreSet = {
      id: "projection-test",
      name: "Проверка",
      scores: { Математика: 85, Информатика: 85, "Русский язык": 85 },
      individualAchievements: 5,
      additionalExamScores: Object.fromEntries(
        programs.flatMap((program) =>
          getAdditionalExams(program).map((exam) => [
            `${program.slug}:${exam.id}`,
            85,
          ]),
        ),
      ),
      updatedAt: "2026-11-10T00:00:00.000Z",
    };
    expect(
      groupMatches(list, profile).map(({ program, match }) => [
        program.id,
        match,
      ]),
    ).toEqual(
      groupMatches(programs, profile).map(({ program, match }) => [
        program.id,
        match,
      ]),
    );
    const examLinks = (rows: typeof list) =>
      rows.flatMap((row) =>
        getAdditionalExams(row).map(({ id, minimum }) => [
          row.slug,
          id,
          minimum.sourceUrl,
          minimum.year,
        ]),
      );
    expect(examLinks(list)).toEqual(examLinks(programs));
    expect(examLinks(list).length).toBeGreaterThan(0);
    expect(list[0]).not.toHaveProperty("passingHistory");
    expect(list[0].passingScoreValue).not.toHaveProperty("sourceUrl");
  });
});
