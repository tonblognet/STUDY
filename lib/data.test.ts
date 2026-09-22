import { describe, expect, it } from "vitest";
import { programs, universities } from "./data";

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
    expect(universities).toHaveLength(162);
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
