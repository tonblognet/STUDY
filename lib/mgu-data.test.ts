import { describe, expect, it } from "vitest";
import { programs } from "./data";
import { matchProgram } from "./admissions/matching";
import {
  getMguProgramPassingHistory,
  getMguProgramTitle,
  mguCatalogPrograms,
  mguPassingScoreRecords,
  getMguEgeGroups,
} from "./mgu-data";

describe("МГУ: идентичность конкурсных групп и архив", () => {
  it("изолирует конфликт источников и несопоставимый тренд", () => {
    const math = programs.find(
      (p) => p.universitySlug === "mgu" && p.title === "Математика",
    )!;
    expect(math.passingScoreValue.status).toBe("conflicting_sources");
    expect(math.passingScoreValue.note).toContain("324");
    const match = matchProgram(math, {
      id: "test",
      name: "test",
      scores: {},
      individualAchievements: 0,
      updatedAt: "2026-09-08",
    });
    expect(match.category).toBe("insufficient");
    expect(match.trend).toBeNull();
  });
  it("сохраняет все 85 групп и общую группу наук о Земле", () => {
    const msu = programs.filter((p) => p.universitySlug === "mgu");
    expect(msu).toHaveLength(85);
    expect(new Set(msu.map((p) => p.slug)).size).toBe(85);
    expect(msu.find((p) => p.slug === "mgu-economics")?.id).toBe(
      "msu-economics",
    );
    expect(msu.filter((p) => p.code === "05.03.00")).toHaveLength(1);
    expect(msu.find((p) => p.code === "05.03.00")?.budgetPlaces).toBe(147);
  });
  it("не переносит баллы общей физики на отдельный новый профиль", () => {
    const seed = mguCatalogPrograms.find((p) =>
      p.description.includes('программа "Теоретическая'),
    )!;
    expect(getMguProgramTitle(seed.description)).toBe(
      "Теоретическая и математическая физика",
    );
    expect(getMguProgramPassingHistory(seed)).toEqual([]);
  });
  it("не переносит математику на фундаментальную математику до появления профиля", () => {
    const seed = mguCatalogPrograms[2];
    expect(getMguProgramPassingHistory(seed).some((p) => p.year < 2021)).toBe(
      false,
    );
    expect(
      getMguProgramPassingHistory(seed).find((p) => p.year === 2024)?.score,
    ).toBe(379);
  });
  it("различает обязательные экзамены и альтернативы", () => {
    const cmc = mguCatalogPrograms.find((p) =>
      p.faculty.includes("кибернетики"),
    )!;
    expect(getMguEgeGroups(cmc).map((p) => p.subjects)).toEqual([
      ["Математика"],
      ["Физика"],
      ["Информатика"],
      ["Русский язык"],
    ]);
    const physics = mguCatalogPrograms.find((p) => p.code === "03.05.02")!;
    expect(
      getMguEgeGroups(physics).some(
        (p) =>
          p.subjects.includes("Математика") &&
          p.subjects.includes("Информатика"),
      ),
    ).toBe(true);
  });
  it("сохраняет обе волны и годы источников", () => {
    const row = mguPassingScoreRecords.find(
      (p) => p.year === 2015 && p.program === "Математика",
    )!;
    expect(row.firstWaveScore).toBe(346);
    expect(row.secondWaveScore).toBe(328);
    expect(new Set(mguPassingScoreRecords.map((p) => p.year)).size).toBe(15);
    expect(
      mguPassingScoreRecords.every((p) =>
        new URL(p.sourceUrl).hostname.endsWith("msu.ru"),
      ),
    ).toBe(true);
    expect(
      mguPassingScoreRecords.some((p) =>
        p.faculty.toLowerCase().includes("филиал"),
      ),
    ).toBe(false);
  });
});
