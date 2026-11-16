import snapshot from "@/data-sources/release/2026-12/evidence/2026-11-16-hse-full-admissions.json";
import type { Program } from "@/lib/data";
import type {
  DataStatus,
  HistoricalPoint,
  SourceKind,
  SourcedValue,
} from "@/lib/admissions/types";

type Source = {
  url: string;
  kind: string;
  retrievedAt: string;
  sha256: string;
};
const sources: Record<string, Source> = snapshot.sources;

function fact<T>(
  value: T | null,
  sourceId: string,
  section: string,
  options: { year?: number; status?: DataStatus; note?: string } = {},
): SourcedValue<T> {
  const source = sources[sourceId];
  return {
    value,
    year: options.year ?? snapshot.year,
    status: options.status ?? (value === null ? "pending_review" : "verified"),
    sourceKind: source.kind as SourceKind,
    sourceUrl: source.url,
    sourceName: "НИУ ВШЭ",
    sourceSection: section,
    retrievedAt: source.retrievedAt,
    checkedAt: snapshot.checkedAt,
    checkedBy: "Редакция Поступай",
    note: options.note,
  };
}

type ProgramInput = Omit<
  Program,
  "university" | "universityShort" | "previousScores" | "verified" | "updatedAt"
>;

export const hseProgramInputs: ProgramInput[] = snapshot.programs.map((row) => {
  const history = (funding: "budget" | "paid"): HistoricalPoint[] =>
    row.history.map((point) => {
      const result = point[funding];
      return fact(result.value, point.source, result.locator, {
        year: point.year,
        status: result.status as DataStatus,
        note: result.note,
      });
    });
  const passingHistory = history("budget");
  const paidPassingHistory = history("paid");
  const previous =
    passingHistory.find(
      (point) => point.year === snapshot.year - 1 && point.value !== null,
    ) ??
    passingHistory.findLast((point) => point.value !== null) ??
    fact<number>(null, row.placesSource, row.placesLocator, {
      year: snapshot.year - 1,
      status: "not_published",
      note: "Подтверждённый проходной для этой конкурсной группы уточняется.",
    });
  const placesNote = "План бюджетных мест включает места в пределах квот.";
  const budget = fact(row.budget, row.placesSource, row.placesLocator, {
    note: placesNote,
  });
  const paid = fact(row.paid, row.placesSource, row.placesLocator, {
    note: "Основной договор. Отдельные места для иностранных граждан учтены в источнике отдельно.",
  });
  const tuition = fact(row.tuition, row.tuitionSource, row.tuitionLocator, {
    note: row.tuitionNote,
  });
  const additionalExams = row.additionalExams.map((exam, index) => ({
    id: `${row.slug}-additional-${index + 1}`,
    title: fact(exam.title, row.examsSource, exam.locator),
    minimum: fact(exam.minimum, row.examsSource, exam.locator),
    maximum: fact(
      100,
      snapshot.rulesSource,
      "Правила приёма 2026, пункт 2.29, стр. 16",
    ),
  }));
  const hasAdditional = additionalExams.length > 0;
  const dviTitle = hasAdditional
    ? additionalExams.map((exam) => exam.title.value).join(", ")
    : null;
  const notApplicable = { status: "not_applicable" as const };
  const conditions = row.higherEducationExams.map((exam) =>
    fact(
      `На базе высшего образования. ${exam.title}. Минимум по строке источника — ${exam.minimum}.`,
      row.examsSource,
      exam.locator,
    ),
  );
  if (row.form === "Очно-заочная") {
    conditions.unshift(
      fact(
        "Отдельный маршрут для поступающих на базе профессионального или высшего образования. Требования к предыдущему образованию указаны в официальной таблице испытаний.",
        row.examsSource,
        row.placesLocator,
      ),
    );
  }
  return {
    id: row.id,
    slug: row.slug,
    universitySlug: "hse",
    code: row.codes.join(" / "),
    title: row.title,
    level: row.level as Program["level"],
    form: row.form as Program["form"],
    duration: row.duration ?? "Срок уточняется",
    durationValue: fact(row.duration, row.identitySource, row.identityLocator),
    faculty: row.faculty,
    facultyValue: fact(row.faculty, row.facultySource, row.facultyLocator),
    campus: row.campusName,
    language: row.language,
    subjects: row.exams.map((exam) => exam.subjects.join(" / ")),
    examRequirements: row.exams.map((exam, index) => ({
      id: `${row.slug}-exam-${index + 1}`,
      label: `Испытание ${index + 1}`,
      subjects: exam.subjects,
      minimum: fact(exam.minima[0], row.examsSource, exam.locator),
      ...(new Set(exam.minima).size > 1
        ? {
            subjectMinimums: Object.fromEntries(
              exam.subjects.map((subject, subjectIndex) => [
                subject,
                fact(exam.minima[subjectIndex], row.examsSource, exam.locator),
              ]),
            ),
          }
        : {}),
      required: true,
    })),
    admissionConditions: conditions,
    passingScore: previous.value,
    passingScoreValue: previous,
    passingScoreExamScale: null,
    passingHistory,
    paidPassingHistory,
    placesHistory: [budget],
    tuitionHistory: [tuition],
    competitionHistory: [],
    minScore: null,
    budgetPlaces: budget.value,
    budgetPlacesValue: budget,
    paidPlaces: paid.value,
    paidPlacesValue: paid,
    tuition: tuition.value,
    tuitionValue: tuition,
    dvi: dviTitle,
    dviValue: fact(
      dviTitle,
      row.examsSource,
      row.placesLocator,
      hasAdditional ? {} : notApplicable,
    ),
    dviMax: fact<number>(
      additionalExams.length === 1 ? 100 : null,
      snapshot.rulesSource,
      "Правила приёма 2026, пункт 2.29",
      hasAdditional ? {} : notApplicable,
    ),
    additionalExams: hasAdditional ? additionalExams : undefined,
    individualAchievementsMax: fact<number>(
      row.achievementLimit,
      row.achievementSource,
      row.achievementLocator,
    ),
    quotas: {
      special: fact(row.special, row.placesSource, row.placesLocator),
      separate: fact(row.separate, row.placesSource, row.placesLocator),
      target: fact(row.target, row.placesSource, row.placesLocator),
      general: fact<number>(null, row.placesSource, row.placesLocator, {
        note: "Точный план мест общего конкурса проверяется отдельно. КЦП включает квоты.",
      }),
    },
    hostel: fact<boolean>(null, row.placesSource, row.placesLocator, {
      note: "Право заселения и наличие мест зависят от категории поступающего.",
    }),
    militaryCenter: fact<boolean>(null, row.placesSource, row.placesLocator, {
      note: "Доступность ВУЦ для конкретной программы проверяется отдельно.",
    }),
    sourceUrl: sources[row.examsSource].url,
    admissionsUrl: row.programUrl ?? sources[row.examsSource].url,
    trust: {
      dataYear: snapshot.year,
      status: "pending_review",
      completeness: 0,
      checkedAt: snapshot.checkedAt,
      checkedBy: "Редакция Поступай",
      sourceName: "НИУ ВШЭ",
      sourceDocumentTitle: "План мест и вступительные испытания 2026",
      sourceSection: `${row.campusName}, ${row.codes.join(" / ")}, ${row.title}`,
      note: "Данные приёма сверены по отдельным источникам. Общий конкурс, условия заселения и доступность ВУЦ требуют проверки.",
    },
    tags: [row.campusName, ...(row.online ? ["Онлайн"] : [])],
  };
});

export type HseMasterTuition = {
  title: string;
  code: string;
  campus: string;
  form: string;
  tuition: SourcedValue<number>;
  sourceUrl: string;
  programUrl: string | null;
  budgetPlaces: SourcedValue<number>;
  paidPlaces: SourcedValue<number>;
  exams: SourcedValue<string>;
  faculty: string | null;
  duration: string | null;
};

export const hseMasterTuition: HseMasterTuition[] = snapshot.masterTuition.map(
  (row) => ({
    title: row.title,
    code: row.code,
    campus: row.campus,
    form: row.form,
    tuition: fact(row.tuition, row.source, row.locator, { note: row.note }),
    sourceUrl: sources[row.source].url,
    programUrl: row.programUrl,
    budgetPlaces: fact(
      row.budget,
      row.admissionSource,
      "Паспорт программы, количество мест в 2026 году",
    ),
    paidPlaces: fact(
      row.paid,
      row.admissionSource,
      "Паспорт программы, количество мест в 2026 году",
    ),
    exams: fact(
      row.exams,
      row.admissionSource,
      "Паспорт программы, вступительные испытания в 2026 году",
    ),
    faculty: row.faculty,
    duration: row.duration,
  }),
);
