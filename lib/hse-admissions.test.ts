import { describe, expect, it } from "vitest";
import { programs } from "@/lib/data";
import { hseMasterTuition } from "./hse-admissions";
import { matchProgram } from "./admissions/matching";

const hse = programs.filter((row) => row.universitySlug === "hse");

describe("HSE published 2026 admission groups", () => {
  it("preserves each campus and the combined Nizhny Novgorod mathematics contest", () => {
    expect(hse).toHaveLength(121);
    expect(
      Object.fromEntries(
        ["Москва", "Санкт-Петербург", "Нижний Новгород", "Пермь"].map(
          (campus) => [
            campus,
            hse.filter((row) => row.campus === campus).length,
          ],
        ),
      ),
    ).toEqual({
      Москва: 73,
      "Санкт-Петербург": 22,
      "Нижний Новгород": 16,
      Пермь: 10,
    });
    const math = hse.filter(
      (row) =>
        row.campus === "Нижний Новгород" &&
        row.title === "Фундаментальная и прикладная математика",
    );
    expect(math).toHaveLength(1);
    expect(math[0].code).toBe("01.03.01 / 01.03.04");
    expect(math[0].budgetPlaces).toBe(45);
  });

  it("takes the architecture price from the passport confirming its exact code", () => {
    const architecture = hse.find(
      (row) => row.campus === "Санкт-Петербург" && row.title === "Архитектура",
    )!;
    expect(architecture.code).toBe("07.03.01");
    expect(architecture.tuition).toBe(740_000);
    expect(architecture.tuitionValue.sourceUrl).toBe(
      "https://spb.hse.ru/ba/architecture/admission/",
    );
    expect(architecture.tuitionValue.note).toContain("расходится");
  });

  it("keeps missing prices and common-contest quotas unknown", () => {
    expect(hse.filter((row) => row.tuition === null)).toHaveLength(3);
    const economics = hse.find((row) => row.slug === "hse-economics")!;
    expect(economics.budgetPlaces).toBe(100);
    expect(economics.quotas.general.value).toBeNull();
    expect(economics.quotas.general.status).toBe("pending_review");
    expect(hseMasterTuition).toHaveLength(204);
    expect(hseMasterTuition.every((row) => row.tuition.year === 2026)).toBe(
      true,
    );
  });

  it("requires both actor examinations while keeping historical passing results separate", () => {
    const actor = hse.find((row) => row.code === "52.05.01")!;
    expect(actor.level).toBe("Специалитет");
    expect(actor.additionalExams).toHaveLength(2);
    expect(actor.additionalExams!.map((exam) => exam.minimum.value)).toEqual([
      60, 60,
    ]);
    const result = matchProgram(actor, {
      id: "actor-boundary",
      name: "Synthetic exam profile",
      scores: { "Русский язык": 100, Литература: 100 },
      individualAchievements: 0,
      updatedAt: "2026-11-16T00:00:00.000Z",
    });
    expect(result.eligibility).toBe("unknown");
    expect(result.requirementsMissing.join(" ")).toContain("ДВИ");
  });

  it("keeps reviewed masters facts tied to the exact direction and field source", () => {
    const select = (code: string, title: string, campus = "Москва") =>
      hseMasterTuition.find(
        (row) =>
          row.code === code && row.title === title && row.campus === campus,
      )!;
    const cpm = select(
      "01.04.01",
      "Совместная магистратура НИУ ВШЭ и Центра педагогического мастерства",
    );
    expect(cpm.budgetPlaces.value).toBe(18);
    expect(cpm.paidPlaces.value).toBe(5);
    expect(cpm.exams.value).toBe("Математика (письменно)");
    expect(cpm.exams.sourceUrl).toBe("https://www.hse.ru/ma/cpm/admission/");
    expect(cpm.exams.sourceSection).toContain("01.04.01");
    expect(cpm.faculty).toBe("Факультет математики");
    expect(cpm.duration).toBe("2 года");

    const sport = hseMasterTuition.filter((row) =>
      row.programUrl?.endsWith("/ma/insport/"),
    );
    expect(sport).toHaveLength(2);
    expect(
      Object.fromEntries(sport.map((row) => [row.code, row.paidPlaces.value])),
    ).toEqual({
      "38.04.02": 40,
      "40.04.01": 20,
    });
    for (const row of sport) {
      expect(row.paidPlaces.sourceSection).toContain(row.code);
      expect(row.paidPlaces.sourceUrl).toBe(
        "https://www.hse.ru/ma/insport/admission/",
      );
    }
  });
});
