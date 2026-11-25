import { describe, expect, it } from "vitest";
import { programs, universities } from "./data";
import moscowDirectory from "@/data-sources/moscow/universities.json";

describe("официальное наполнение каталога", () => {
  it("публикует расширенную линейку МИФИ без дублирования программ", () => {
    const mephiPrograms = programs.filter(
      (program) => program.universitySlug === "mephi",
    );
    expect(mephiPrograms).toHaveLength(12);
    expect(new Set(mephiPrograms.map((program) => program.id)).size).toBe(12);
    expect(
      mephiPrograms.find((program) => program.code === "10.03.01")
        ?.budgetPlaces,
    ).toBe(95);
  });

  it("не распределяет общие места по отдельной программе", () => {
    const computing = programs.find(
      (program) => program.slug === "mephi-informatics-and-computing",
    );
    expect(computing?.budgetPlaces).toBeNull();
    expect(computing?.budgetPlacesValue.note).toContain("общей группой");
  });

  it("сохраняет числовые итоги МИФИ по отдельным бюджетным конкурсам", () => {
    const mephiPrograms = programs.filter(
      (row) => row.universitySlug === "mephi",
    );
    const results = mephiPrograms.flatMap((row) =>
      row.passingHistory.map((result) => [
        row.code,
        result.year,
        result.value,
        result.sourceUrl,
      ]),
    );
    expect(results).toEqual([
      ["03.03.01", 2026, 295, "https://mephi.ru/press/news/26374"],
      ["09.03.01", 2026, 300, "https://mephi.ru/press/news/26374"],
      ["15.03.06", 2026, 300, "https://mephi.ru/press/news/26374"],
    ]);
    expect(
      mephiPrograms.find((row) => row.code === "01.03.02")?.passingScoreValue
        .note,
    ).toContain("без вступительных испытаний");
  });

  it("связывает ВУЦ и логотипы с официальными источниками", () => {
    const mai = universities.find((university) => university.slug === "mai");
    expect(mai?.militaryCenter).toBe(true);
    expect(mai?.militaryCenterSourceUrl).toContain("mai.ru");
    expect(
      programs.find((program) => program.universitySlug === "mai")
        ?.militaryCenter.value,
    ).toBe(true);
    expect(universities.every((university) => university.logoSourceUrl)).toBe(
      true,
    );
  });

  it("расширяет московский каталог без дубликатов и выдуманных чисел", () => {
    const moscowSlugs = new Set(
      moscowDirectory.universities.map((university) => university.slug),
    );
    expect(
      universities.filter((university) => moscowSlugs.has(university.slug)),
    ).toHaveLength(moscowDirectory.universities.length);
    expect(programs.length).toBeGreaterThanOrEqual(100);
    expect(new Set(programs.map((program) => program.id)).size).toBe(
      programs.length,
    );
    expect(new Set(programs.map((program) => program.slug)).size).toBe(
      programs.length,
    );

    const expandedSlugs = [
      "bmstu",
      "mgimo",
      "pirogov",
      "sechenov",
      "gubkin",
      "msal",
      "muctr",
      "rsuh",
      "fa",
      "mospolytech",
    ];
    const expanded = programs.filter((program) =>
      expandedSlugs.includes(program.universitySlug),
    );
    expect(expanded.length).toBeGreaterThanOrEqual(75);
    expect(
      expanded.every((program) => program.sourceUrl.startsWith("https://")),
    ).toBe(true);
    expect(
      expanded.every(
        (program) =>
          program.trust.status === "pending_review" &&
          program.budgetPlaces === null &&
          program.tuition === null &&
          program.passingScore === null,
      ),
    ).toBe(true);
  });
});
