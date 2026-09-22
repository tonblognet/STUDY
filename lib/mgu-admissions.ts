import type { ExamRequirement, SourcedValue } from "./admissions/types";
import { getMguDvi, getMguEgeGroups, type MguCatalogProgram } from "./mgu-data";

export const MGU_MINIMUM_SOURCE = "https://cpk.msu.ru/files/2026/minimum.pdf";
export const MGU_RULES_SOURCE = "https://cpk.msu.ru/files/2026/rules.pdf";
export const MGU_BASE_MINIMUM_SOURCE =
  "https://sev.msu.ru/minimalnoe-kolichestvo-ballov_priemnaya-komissiya/";
export const MGU_REVIEW_DATE = "2026-09-14T00:00:00.000Z";

export function mguFact<T>(
  value: T | null,
  sourceUrl: string,
  sourceSection: string,
  extra: Partial<SourcedValue<T>> = {},
): SourcedValue<T> {
  return {
    value,
    year: 2026,
    status: value === null ? "pending_review" : "verified",
    sourceUrl,
    sourceName: "МГУ имени М. В. Ломоносова",
    sourceKind: sourceUrl.endsWith(".pdf") ? "pdf" : "html",
    sourceSection,
    retrievedAt: MGU_REVIEW_DATE,
    checkedAt: MGU_REVIEW_DATE,
    checkedBy: "Редакция Поступай",
    nextReviewAt: "2026-10-14T00:00:00.000Z",
    ...extra,
  };
}

const base: Record<string, number> = {
  "Русский язык": 36,
  Математика: 27,
  Физика: 36,
  Химия: 36,
  Информатика: 40,
  Биология: 36,
  История: 32,
  География: 37,
  Обществознание: 42,
  Литература: 32,
  "Иностранный язык": 22,
};

export function getMguMinimum(
  program: MguCatalogProgram,
  subject: string,
  dvi = false,
) {
  let section = dvi ? "1.2" : "1.1";
  let page = 1;
  let value = base[subject];
  let override: Record<string, number> = {};
  if (dvi) {
    if (getMguDvi(program)?.includes("творческой")) {
      value = 40;
      section = "1.12";
      page = 3;
    } else if (
      program.faculty === "Механико-математический факультет" &&
      program.code === "01.05.01"
    ) {
      value = 50;
      section = "1.4";
      page = 2;
    } else if (
      program.faculty === "Экономический факультет" &&
      program.code === "38.03.01"
    ) {
      value = 50;
      section = "1.8";
      page = 2;
    } else if (
      program.faculty === "Факультет искусственного интеллекта" &&
      program.code === "01.03.02"
    ) {
      value = 50;
      section = "1.11";
      page = 3;
    }
  } else {
    if (
      program.faculty === "Механико-математический факультет" &&
      program.code === "01.05.01"
    ) {
      override = { Математика: 70, Физика: 55, "Русский язык": 60 };
      section = "1.3";
    } else if (
      program.faculty === "Факультет вычислительной математики и кибернетики" &&
      ["01.03.02", "02.03.02"].includes(program.code)
    ) {
      override = {
        Математика: 60,
        Физика: 55,
        Информатика: 65,
        "Русский язык": 60,
      };
      section = "1.5";
      page = 2;
    } else if (
      program.faculty === "Филологический факультет" &&
      program.code === "45.03.03"
    ) {
      override = { Математика: 60 };
      section = "1.6";
      page = 2;
    } else if (
      program.faculty === "Экономический факультет" &&
      ["38.03.01", "38.03.02"].includes(program.code)
    ) {
      override = {
        Математика: program.code === "38.03.01" ? 70 : 60,
        "Русский язык": 60,
      };
      section = "1.7";
      page = 2;
    } else if (
      program.faculty === "Институт стран Азии и Африки" &&
      program.code === "58.03.01"
    ) {
      override = { "Иностранный язык": 60 };
      section = "1.9";
      page = 2;
    } else if (
      program.faculty === "Факультет искусственного интеллекта" &&
      program.code === "01.03.02"
    ) {
      override = {
        Математика: 70,
        Физика: 70,
        Информатика: 70,
        "Русский язык": 60,
      };
      section = "1.10";
      page = 3;
    }
    if (override[subject] !== undefined) value = override[subject];
    else {
      section = "1.1";
      page = 1;
    }
  }
  const common = section === "1.1" || section === "1.2";
  return mguFact(
    value ?? null,
    common ? MGU_BASE_MINIMUM_SOURCE : MGU_MINIMUM_SOURCE,
    common
      ? `Общие минимумы ЕГЭ; пункт ${section} минимумов МГУ 2026`
      : `Пункт ${section}: ${program.faculty}, ${program.code}`,
    {
      ...(common ? {} : { sourcePage: page }),
      note: common
        ? `Численный порог Рособрнадзора применяется по пункту ${section} документа ${MGU_MINIMUM_SOURCE}. Это минимум участия, а не проходной балл.`
        : "Минимум участия в конкурсе 2026, не исторический проходной балл.",
    },
  );
}

export function getMguExamRequirements(
  program: MguCatalogProgram,
): ExamRequirement[] {
  return getMguEgeGroups(program).map((group, index) => {
    const subjectMinimums = Object.fromEntries(
      group.subjects.map((subject) => [
        subject,
        getMguMinimum(program, subject),
      ]),
    );
    const values = Object.values(subjectMinimums);
    // A group minimum is meaningful only when all alternatives have the same threshold.
    const minimum = values.every((item) => item.value === values[0].value)
      ? values[0]
      : mguFact<number>(
          null,
          MGU_MINIMUM_SOURCE,
          "Минимумы различаются по предметам",
          { note: "Используйте отдельный минимум каждого предмета по выбору." },
        );
    return {
      id: `msu-${program.code}-${index + 1}`,
      label: group.label,
      subjects: group.subjects,
      minimum,
      subjectMinimums,
      required: true,
    };
  });
}

export function getMguDviMinimum(program: MguCatalogProgram) {
  const dvi = getMguDvi(program) ?? "";
  const subject =
    Object.keys(base).find((item) =>
      dvi.toLocaleLowerCase("ru").startsWith(item.toLocaleLowerCase("ru")),
    ) ?? "Творческое испытание";
  const minimum = getMguMinimum(program, subject, true);
  if (program.faculty === "Социологический факультет") {
    return {
      ...minimum,
      status: "conflicting_sources" as const,
      note: `Расхождение: п. 1.2 минимумов МГУ (${MGU_MINIMUM_SOURCE}) задаёт общий порог по обществознанию 42; страница факультета https://www.socio.msu.ru/index.php/абитуриентам указывает минимум ДВИ 40. Требуется уточнение комиссии; в подборе не используется.`,
    };
  }
  return minimum;
}
