import { describe, expect, it } from "vitest";
import type { UniversityOffering } from "@/lib/university-directory-details";
import {
  filterHseExplorerRows,
  hseAdmissionYears,
  hseExplorerData,
  hseExplorerRows,
  hseHasKnownConditions,
  hseStudyModes,
  type HseDisplayFact,
  type HseExplorerMaster,
  type HseExplorerOffering,
  type HseExplorerProgram,
} from "./hse-explorer-data";

const fact = <T>(
  value: T | null,
  status: HseDisplayFact<T>["status"] = "verified",
  year = 2026,
): HseDisplayFact<T> => ({
  value,
  status,
  year,
  sourceUrl: "https://www.hse.ru/admissions/",
});
const program: HseExplorerProgram = {
  id: "ba",
  slug: "hse-ba",
  title: "Аналитика",
  code: "01.03.02",
  campus: "Москва",
  level: "Бакалавриат",
  form: "Очная",
  duration: "4 года",
  faculty: "Факультет информатики",
  sourceUrl: "https://www.hse.ru/ba/analytics/",
  admissionsUrl: "https://www.hse.ru/ba/analytics/",
  tags: ["Онлайн"],
  admissionYear: 2026,
  tuitionValue: fact(400_000),
  budgetPlacesValue: fact(10),
  paidPlacesValue: fact(20),
  passingScoreValue: fact(280, "verified", 2025),
  passingHistory: [fact(270, "verified", 2024)],
};
const offering: HseExplorerOffering = {
  id: "ma",
  title: "Прикладная математика",
  profile: "Анализ данных",
  code: "01.04.02",
  level: "Магистратура",
  campus: "Москва",
  forms: "Очная",
  duration: null,
  sourceUrl: "https://www.hse.ru/n/education/magister/",
  programUrl: "https://www.hse.ru/ma/data/",
};
const master: HseExplorerMaster = {
  title: "Анализ данных",
  code: "01.04.02",
  campus: "Москва",
  form: "Очная",
  sourceUrl: "https://ma.hse.ru/tuition/",
  programUrl: "https://www.hse.ru/ma/data/",
  tuition: fact(300_000),
  budgetPlaces: fact(0),
  paidPlaces: fact(15),
  exams: fact("Портфолио"),
  faculty: "Факультет математики",
  duration: "2 года",
};

describe("HSE explorer evidence-based filters", () => {
  it.each([
    ["Очная", ["Очная"]],
    ["Очный", ["Очная"]],
    ["Очно", ["Очная"]],
    ["Очно-заочная", ["Очно-заочная"]],
    ["Очно — заочная", ["Очно-заочная"]],
    ["Очно-заочная / Заочная", ["Очно-заочная", "Заочная"]],
    ["Заочная", ["Заочная"]],
    ["Онлайн синхронный", ["Онлайн"]],
    [
      "Гибридный (обучение проходит очно и параллельно в онлайн)",
      ["Очная", "Онлайн"],
    ],
    ["Смешанный", []],
    ["Форма уточняется", []],
  ])(
    "recognizes published mode %s without guessing another legal form",
    (form, expected) => {
      expect(hseStudyModes({ form })).toEqual(expected);
    },
  );

  it("preserves online delivery alongside the program's in-person form", () => {
    const rows = hseExplorerRows([program], []);
    expect(hseStudyModes(rows[0])).toEqual(["Очная", "Онлайн"]);
    expect(filterHseExplorerRows(rows, { form: "Очно-заочная" })).toEqual([]);
    expect(filterHseExplorerRows(rows, { form: "Онлайн" })).toHaveLength(1);
  });

  it("joins master conditions only for the same title, code, campus and form", () => {
    const rows = hseExplorerRows([], [offering], [master]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      title: "Анализ данных",
      faculty: master.faculty,
      duration: "2 года",
      masterTuition: master,
    });
    const differentForm = hseExplorerRows(
      [],
      [{ ...offering, forms: "Очно-заочная" }],
      [master],
    );
    expect(differentForm).toHaveLength(2);
    expect(
      differentForm.find((row) => row.id === "ma")?.masterTuition,
    ).toBeUndefined();
    expect(
      differentForm.find((row) => row.id.startsWith("master-tuition"))?.faculty,
    ).toBe(master.faculty);
  });

  it("keeps unknowns in the unfiltered list and excludes them from positive funding filters", () => {
    const rows = hseExplorerRows(
      [
        program,
        {
          ...program,
          id: "zero",
          budgetPlacesValue: fact(0),
          paidPlacesValue: fact(0),
        },
        {
          ...program,
          id: "pending",
          budgetPlacesValue: fact(50, "pending_review"),
          paidPlacesValue: fact(50, "outdated"),
        },
        {
          ...program,
          id: "unknown",
          budgetPlacesValue: fact<number>(null),
          paidPlacesValue: fact<number>(null),
        },
      ],
      [offering],
      [master],
    );
    expect(filterHseExplorerRows(rows, {})).toHaveLength(5);
    expect(
      filterHseExplorerRows(rows, { funding: "budget" }).map((row) => row.id),
    ).toEqual(["program-ba"]);
    expect(
      filterHseExplorerRows(rows, { funding: "paid" })
        .map((row) => row.id)
        .sort(),
    ).toEqual(["ma", "program-ba"]);
  });

  it("filters only annual program tuition and never treats a course price as annual or as a paid place", () => {
    const course: HseExplorerOffering = {
      ...offering,
      id: "course",
      title: "Короткий курс",
      profile: null,
      level: "Дополнительное образование",
      sourceUrl: "https://www.hse.ru/n/education/online/",
      publishedPrice: { amount: 5_000, currency: "RUB", period: "за курс" },
    };
    const rows = hseExplorerRows(
      [
        program,
        {
          ...program,
          id: "pending",
          tuitionValue: fact(200_000, "pending_review"),
        },
      ],
      [offering, course],
      [master],
    );
    expect(
      filterHseExplorerRows(rows, { maxTuition: "300000" }).map(
        (row) => row.id,
      ),
    ).toEqual(["ma"]);
    expect(filterHseExplorerRows(rows, { maxTuition: "400000" })).toHaveLength(
      2,
    );
    expect(filterHseExplorerRows(rows, { maxTuition: "0" })).toEqual([]);
    expect(filterHseExplorerRows(rows, { maxTuition: "-1" })).toEqual([]);
    expect(filterHseExplorerRows(rows, { maxTuition: "invalid" })).toEqual([]);
    expect(
      filterHseExplorerRows(rows, { funding: "paid" }).some(
        (row) => row.id === "course",
      ),
    ).toBe(false);
  });

  it("does not use snapshot or historical score years as admission campaigns and keeps facts within the selected year", () => {
    const rows = hseExplorerRows(
      [program],
      [offering],
      [{ ...master, tuition: fact(300_000, "verified", 2025) }],
    );
    expect(hseAdmissionYears(rows.find((row) => row.program)!)).toEqual([2026]);
    expect(filterHseExplorerRows(rows, { year: "2024" })).toEqual([]);
    expect(
      filterHseExplorerRows(rows, { year: "2026", maxTuition: "350000" }),
    ).toEqual([]);
    expect(
      filterHseExplorerRows(rows, { year: "2025", maxTuition: "350000" }).map(
        (row) => row.id,
      ),
    ).toEqual(["ma"]);
    expect(hseAdmissionYears(hseExplorerRows([], [offering])[0])).toEqual([]);
  });

  it("combines faculty, multi-campus, level, form, funding, price, year and conditions with search", () => {
    const rows = hseExplorerRows([program], [offering], [master]);
    expect(
      filterHseExplorerRows(rows, {
        query: "  АНАЛИЗ   ДАННЫХ ",
        campus: "Москва",
        level: "Магистратура",
        faculty: master.faculty!,
        form: "Очная",
        funding: "paid",
        maxTuition: "300000",
        year: "2026",
        conditions: "known",
      }).map((row) => row.id),
    ).toEqual(["ma"]);
    const asp = hseExplorerRows(
      [],
      [
        {
          ...offering,
          id: "asp",
          level: "Аспирантура",
          campus: "Москва Нижний Новгород Санкт-Петербург",
        },
      ],
    );
    expect(
      filterHseExplorerRows(asp, { campus: "Нижний Новгород" }),
    ).toHaveLength(1);
    expect(filterHseExplorerRows(asp, { campus: "Пермь" })).toEqual([]);
  });

  it("distinguishes any verified admission conditions from directory-only records without claiming completeness", () => {
    const rows = hseExplorerRows([program], [offering]);
    expect(hseHasKnownConditions(rows[0])).toBe(true);
    expect(
      filterHseExplorerRows(rows, { conditions: "known" }).map((row) => row.id),
    ).toEqual(["program-ba"]);
    expect(
      filterHseExplorerRows(rows, { conditions: "needs-review" }).map(
        (row) => row.id,
      ),
    ).toEqual(["ma"]);
  });

  it("projects an explicit graduate school separately from the subject area and discards raw locator metadata", () => {
    const raw: UniversityOffering = {
      ...offering,
      level: "Аспирантура",
      sourceUrl: "https://aspirantura.hse.ru/spec",
      profile: "Математика и механика",
      sourceSection:
        "/table/tr[3]; аспирантская школа: Аспирантская школа по математике; ячейки раскрыты",
      sourceYear: 2026,
      checkedAt: "2026-11-18",
      sourceSha256: "snapshot",
      admissionsStatus: "pending_review",
    };
    const projected = hseExplorerData(
      [],
      [raw, { ...raw, id: "unknown-school", sourceSection: "/table/tr[4]" }],
      [],
    );
    expect(projected.offerings[0].faculty).toBe(
      "Аспирантская школа по математике",
    );
    expect(projected.offerings[1].faculty).toBeNull();
    expect(projected.offerings[0]).not.toHaveProperty("sourceSection");
    expect(projected.offerings[0]).not.toHaveProperty("sourceYear");
    expect(
      filterHseExplorerRows(hseExplorerRows([], projected.offerings), {
        year: "2026",
      }),
    ).toEqual([]);
  });
});
