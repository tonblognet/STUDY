import { describe, expect, it } from "vitest";
import { programs } from "./data";
import { mguCatalogPrograms } from "./mgu-data";
import { getMguMinimum, getMguDviMinimum } from "./mgu-admissions";
import { getMguDetails } from "./mgu-details";
import { matchProgram } from "./admissions/matching";
import { calculateCompleteness } from "./admissions/completeness";
import details from "@/data-sources/universities/msu/program-details-2026.json";
import contacts from "@/data-sources/universities/msu/contacts-2026.json";

describe("МГУ: правила кампании 2026", () => {
  it("покрывает минимумы каждого предмета и ДВИ всех 85 групп", () => {
    const msu = programs.filter((p) => p.universitySlug === "mgu");
    expect(msu).toHaveLength(85);
    for (const program of msu) {
      expect(program.examRequirements.length).toBeGreaterThan(0);
      for (const group of program.examRequirements) {
        for (const subject of group.subjects) {
          const minimum = group.subjectMinimums?.[subject];
          expect(minimum?.status, `${program.title}: ${subject}`).toBe(
            "verified",
          );
          expect(minimum?.value).toBeGreaterThan(0);
          expect(minimum?.year).toBe(2026);
          expect(minimum?.sourceUrl).toMatch(/^https:\/\/.*msu.ru\//);
        }
      }
      expect(program.dviMinimum?.status, program.title).toBe(
        program.faculty === "Социологический факультет"
          ? "conflicting_sources"
          : "verified",
      );
      expect(program.dviMinimum?.value).toBeGreaterThan(0);
      expect(calculateCompleteness(program).missing).not.toContain(
        "вступительные испытания",
      );
    }
  });

  it("применяет исключения по факультету и коду, отдельно от ДВИ", () => {
    const find = (faculty: string, code: string) =>
      mguCatalogPrograms.find((p) => p.faculty === faculty && p.code === code)!;
    const economics = find("Экономический факультет", "38.03.01");
    const management = find("Экономический факультет", "38.03.02");
    const cmc = find(
      "Факультет вычислительной математики и кибернетики",
      "01.03.02",
    );
    const ai = find("Факультет искусственного интеллекта", "01.03.02");
    expect(getMguMinimum(economics, "Математика").value).toBe(70);
    expect(getMguMinimum(management, "Математика").value).toBe(60);
    expect(getMguDviMinimum(economics).value).toBe(50);
    expect(getMguDviMinimum(management).value).toBe(27);
    expect(getMguMinimum(cmc, "Информатика").value).toBe(65);
    expect(getMguDviMinimum(cmc).value).toBe(27);
    expect(getMguMinimum(ai, "Информатика").value).toBe(70);
    expect(getMguDviMinimum(ai).value).toBe(50);
    expect(
      getMguMinimum({ ...economics, faculty: "Другой факультет" }, "Математика")
        .value,
    ).toBe(27);
  });

  it("выбирает допустимую альтернативу при разных минимумах", () => {
    const physics = programs.find(
      (p) => p.universitySlug === "mgu" && p.code === "03.05.02",
    )!;
    const program = {
      ...physics,
      passingScoreValue: {
        ...physics.passingScoreValue,
        value: 300,
        status: "verified" as const,
      },
    };
    const result = matchProgram(program, {
      id: "test",
      name: "test",
      scores: {
        "Русский язык": 100,
        Физика: 100,
        Математика: 30,
        Информатика: 39,
      },
      dviScore: 100,
      individualAchievements: 0,
      updatedAt: "2026-09-14",
    });
    expect(result.consideredScore).toBe(330);
    expect(result.reasons.join(" ")).toContain("Математика — 30");
  });

  it("не допускает ДВИ ниже порога и некорректные результаты", () => {
    const economics = programs.find((p) => p.slug === "mgu-economics")!;
    const profile = {
      id: "test",
      name: "test",
      scores: {
        Математика: 100,
        "Русский язык": 100,
        "Иностранный язык": 100,
        Обществознание: 100,
      },
      individualAchievements: 0,
      updatedAt: "2026-09-14",
    };
    expect(
      matchProgram(economics, { ...profile, dviScore: 49 }).missing.join(" "),
    ).toContain("ДВИ: 49, минимум 50");
    expect(
      matchProgram(economics, { ...profile, dviScore: 50 }).missing.join(" "),
    ).not.toContain("ДВИ");
    for (const invalid of [-1, 101, 99.5, NaN, Infinity]) {
      expect(
        matchProgram(economics, { ...profile, dviScore: invalid })
          .consideredScore,
      ).toBeNull();
      expect(
        matchProgram(economics, {
          ...profile,
          dviScore: 100,
          scores: { ...profile.scores, Математика: invalid },
        }).consideredScore,
      ).toBeNull();
    }
  });

  it("не сравнивает сумму пяти испытаний со старой шкалой четырёх", () => {
    const economics = programs.find((p) => p.slug === "mgu-economics")!;
    const result = matchProgram(
      { ...economics, passingScoreExamScale: 500 },
      {
        id: "test",
        name: "test",
        scores: {
          Математика: 100,
          "Русский язык": 100,
          "Иностранный язык": 100,
          Обществознание: 100,
        },
        dviScore: 100,
        individualAchievements: 10,
        updatedAt: "2026-09-14",
      },
    );
    expect(result.consideredScore).toBeNull();
    expect(result.missing.join(" ")).toContain("шкала");
  });
});

describe("МГУ: факультетские сведения", () => {
  it("сохраняет точные идентичности и контакты всех факультетов", () => {
    expect(details.programs).toHaveLength(85);
    expect(contacts.contacts).toHaveLength(39);
    expect(new Set(contacts.contacts.map((c) => c.faculty)).size).toBe(39);
    for (const seed of mguCatalogPrograms) {
      expect(
        details.programs.filter(
          (p) =>
            p.code === seed.code &&
            p.faculty === seed.faculty &&
            p.description === seed.description,
        ),
      ).toHaveLength(1);
      const contact = getMguDetails(seed).contact;
      for (const field of Object.values(contact)) {
        expect(field.value).toBeTruthy();
        expect(field.sourceUrl).toBe("https://cpk.msu.ru/pk");
        expect(field.value).not.toMatch(/|L\d+:|†/);
      }
    }
  });
  it("не переносит цену и срок на одноимённый новый профиль", () => {
    const seed = mguCatalogPrograms[0];
    const known = getMguDetails(seed);
    expect(known.tuition.value).toBe(557580);
    expect(known.duration.value).toBe("6 лет");
    const unknown = getMguDetails({ ...seed, description: "Новая программа" });
    expect(unknown.tuition.value).toBeNull();
    expect(unknown.duration.value).toBeNull();
    expect(unknown.tuition.status).toBe("pending_review");
  });
  it("различает цены факультетов и сохраняет источник каждого факта", () => {
    expect(
      programs.find((p) => p.slug === "mgu-economics")?.tuitionValue.value,
    ).toBe(900000);
    for (const record of details.programs) {
      for (const field of [record.tuition, record.duration]) {
        if (!field) continue;
        expect(field.sourceUrl).toMatch(/^https:\/\//);
        expect(field.sourceSection.length).toBeGreaterThan(10);
      }
    }
  });
});
