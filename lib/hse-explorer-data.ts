import type { Program } from "@/lib/data";
import type { SourcedValue } from "@/lib/admissions/types";
import type { UniversityOffering } from "@/lib/directory/model";
import type { HseMasterTuition } from "@/lib/hse-admissions";
import type { ArchiveData } from "@/components/hse-score-archive";

export type HseDisplayFact<T> = Pick<
  SourcedValue<T>,
  "value" | "year" | "status" | "sourceUrl"
>;
export type HseExplorerProgram = Pick<
  Program,
  | "id"
  | "slug"
  | "title"
  | "code"
  | "campus"
  | "level"
  | "form"
  | "duration"
  | "faculty"
  | "sourceUrl"
  | "admissionsUrl"
  | "tags"
> & {
  admissionYear?: number;
  tuitionValue: HseDisplayFact<number>;
  budgetPlacesValue: HseDisplayFact<number>;
  paidPlacesValue: HseDisplayFact<number>;
  passingScoreValue: HseDisplayFact<number>;
  passingHistory: HseDisplayFact<number>[];
  paidPassingHistory?: HseDisplayFact<number>[];
};
export type HseExplorerOffering = Pick<
  UniversityOffering,
  | "id"
  | "code"
  | "title"
  | "profile"
  | "level"
  | "forms"
  | "duration"
  | "sourceUrl"
  | "programUrl"
  | "campus"
  | "publishedPrice"
> & {
  /** Only an explicitly named subdivision from the source, never a subject area. */
  faculty?: string | null;
  admission?: HseExplorerRow["admission"];
};
export type HseExplorerMaster = Pick<
  HseMasterTuition,
  | "title"
  | "code"
  | "campus"
  | "form"
  | "sourceUrl"
  | "programUrl"
  | "faculty"
  | "duration"
> & {
  tuition: HseDisplayFact<number>;
  budgetPlaces: HseDisplayFact<number>;
  paidPlaces: HseDisplayFact<number>;
  exams: HseDisplayFact<string>;
};

export type HseStudyMode = "Очная" | "Очно-заочная" | "Заочная" | "Онлайн";
export type HseExplorerRow = {
  id: string;
  title: string;
  code: string;
  campus: string;
  level: string;
  form: string;
  duration: string | null;
  faculty: string | null;
  sourceUrl: string;
  programUrl: string | null;
  program?: HseExplorerProgram;
  offering?: HseExplorerOffering;
  masterTuition?: HseExplorerMaster;
  admission?: {
    priorEducation?: HseDisplayFact<string>;
    schoolBase?: 9 | 11;
    annualTuition?: HseDisplayFact<number>;
    budgetPlaces?: HseDisplayFact<number>;
    paidPlaces?: HseDisplayFact<number>;
    exams?: HseDisplayFact<string>;
    note?: string;
  };
};
export type HseExplorerFilters = {
  query?: string;
  campus?: string;
  level?: string;
  faculty?: string;
  form?: HseStudyMode | "";
  funding?: "" | "budget" | "paid";
  maxTuition?: string;
  year?: string;
  conditions?: "" | "known" | "needs-review";
};

const normalize = (value: string) =>
  value
    .toLocaleLowerCase("ru")
    .replaceAll("ё", "е")
    .replace(/\s+/g, " ")
    .trim();

function programmeUrl(value: string) {
  const url = new URL(value);
  return `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/(admission|tracks)\/?$/, "").replace(/\/$/, "")}`;
}

export function hseCampusNames(value: string) {
  const names = [
    "Москва",
    "Санкт-Петербург",
    "Нижний Новгород",
    "Пермь",
  ].filter((name) => value.includes(name));
  return names.length ? names : [value];
}

function masterIdentity(row: {
  title: string;
  code: string;
  campus: string;
  form: string;
}) {
  return JSON.stringify(
    [row.title, row.code, row.campus, row.form].map(normalize),
  );
}

/** Raw published modes can describe both an in-person form and online delivery. */
export function hseStudyModes(
  row: Pick<HseExplorerRow, "form" | "program">,
): HseStudyMode[] {
  const raw = normalize(row.form).replace(/[–—]/g, "-");
  const modes: HseStudyMode[] = [];
  const combined = /очно\s*-\s*заочн/.test(raw);
  if (combined) modes.push("Очно-заочная");
  const remaining = raw.replace(/очно\s*-\s*заочн(?:ая|ый|ое|о)?/g, "");
  if (/(^|[^а-я])очн(?:ая|ый|ое|о)?(?=$|[^а-я])/.test(remaining))
    modes.push("Очная");
  if (/(^|[^а-я])заочн(?:ая|ый|ое|о)?(?=$|[^а-я])/.test(remaining))
    modes.push("Заочная");
  if (
    raw.includes("онлайн") ||
    row.program?.tags.some((tag) => normalize(tag) === "онлайн")
  ) {
    modes.push("Онлайн");
  }
  return modes;
}

function knownFact(field?: { status: string; value: unknown }) {
  return field?.status === "verified" && field.value !== null;
}

function admissionFacts(row: HseExplorerRow) {
  return {
    tuition:
      row.program?.tuitionValue ??
      row.masterTuition?.tuition ??
      row.admission?.annualTuition,
    budget:
      row.program?.budgetPlacesValue ??
      row.masterTuition?.budgetPlaces ??
      row.admission?.budgetPlaces,
    paid:
      row.program?.paidPlacesValue ??
      row.masterTuition?.paidPlaces ??
      row.admission?.paidPlaces,
    exams: row.masterTuition?.exams ?? row.admission?.exams,
  };
}

/** A catalogue snapshot year is not an admission campaign. Historical scores are separate. */
export function hseAdmissionYears(row: HseExplorerRow): number[] {
  const years = Object.values(admissionFacts(row))
    .filter((field) => knownFact(field))
    .map((field) => field!.year);
  if (row.program?.admissionYear) years.push(row.program.admissionYear);
  return [...new Set(years)].sort((a, b) => b - a);
}

export function hseHasKnownConditions(row: HseExplorerRow, year = "") {
  return Object.values(admissionFacts(row)).some(
    (field) => knownFact(field) && (!year || field!.year === Number(year)),
  );
}

export function hseExplorerRows(
  programs: HseExplorerProgram[],
  offerings: HseExplorerOffering[],
  masterTuition: HseExplorerMaster[] = [],
): HseExplorerRow[] {
  const result: HseExplorerRow[] = programs.map((program) => ({
    id: `program-${program.id}`,
    title: program.title,
    code: program.code,
    campus: program.campus ?? "Кампус уточняется",
    level: program.level,
    form: program.form,
    duration: program.duration,
    faculty: program.faculty,
    sourceUrl: program.sourceUrl,
    programUrl: program.admissionsUrl ?? program.sourceUrl,
    program,
  }));
  const matchedTuition = new Set<string>();
  for (const offering of offerings) {
    const degreeCatalog = /\/n\/education\/(bachelor|magister)(\/|$)/.test(
      offering.sourceUrl,
    );
    const title = degreeCatalog
      ? (offering.profile ?? offering.title)
      : offering.title;
    const campus = offering.campus ?? "Кампус уточняется";
    const published = programs.some(
      (program) =>
        program.code
          .split("/")
          .map(normalize)
          .includes(normalize(offering.code)) &&
        normalize(program.campus ?? "") === normalize(campus) &&
        (normalize(program.title) === normalize(title) ||
          (offering.programUrl &&
            programmeUrl(program.admissionsUrl ?? program.sourceUrl) ===
              programmeUrl(offering.programUrl))),
    );
    if (published) continue;
    const identity = masterIdentity({
      title,
      code: offering.code,
      campus,
      form: offering.forms ?? "",
    });
    const tuition =
      offering.level === "Магистратура"
        ? masterTuition.find((row) => masterIdentity(row) === identity)
        : undefined;
    if (tuition) matchedTuition.add(identity);
    result.push({
      id: offering.id,
      title,
      code: offering.code,
      campus,
      level: offering.level,
      form: offering.forms ?? "Форма уточняется",
      duration: offering.duration ?? tuition?.duration ?? null,
      faculty: tuition?.faculty ?? offering.faculty ?? null,
      sourceUrl: offering.sourceUrl,
      programUrl: offering.programUrl ?? tuition?.programUrl ?? null,
      offering,
      masterTuition: tuition,
      admission: offering.admission,
    });
  }
  for (const [index, tuition] of masterTuition.entries()) {
    if (matchedTuition.has(masterIdentity(tuition))) continue;
    result.push({
      id: `master-tuition-${index}`,
      title: tuition.title,
      code: tuition.code,
      campus: tuition.campus,
      level: "Магистратура",
      form: tuition.form,
      duration: tuition.duration,
      faculty: tuition.faculty,
      sourceUrl: tuition.sourceUrl,
      programUrl: tuition.programUrl,
      masterTuition: tuition,
    });
  }
  const levelOrder: Record<string, number> = {
    Бакалавриат: 0,
    Специалитет: 1,
    Магистратура: 2,
    Аспирантура: 3,
  };
  return result.sort(
    (left, right) =>
      (levelOrder[left.level] ?? 4) - (levelOrder[right.level] ?? 4) ||
      left.title.localeCompare(right.title, "ru"),
  );
}

export function filterHseExplorerRows<T extends HseExplorerRow>(
  rows: T[],
  filters: HseExplorerFilters,
): T[] {
  const term = normalize(filters.query ?? "");
  const maxTuition = filters.maxTuition?.trim()
    ? Number(filters.maxTuition)
    : null;
  return rows.filter((row) => {
    const facts = admissionFacts(row);
    const knownNumber = (field?: HseDisplayFact<number>) =>
      knownFact(field) &&
      (!filters.year || field!.year === Number(filters.year))
        ? field!.value
        : null;
    const annualTuition = knownNumber(facts.tuition);
    return (
      (!filters.campus ||
        hseCampusNames(row.campus).includes(filters.campus)) &&
      (!filters.level || row.level === filters.level) &&
      (!filters.faculty || row.faculty === filters.faculty) &&
      (!filters.form || hseStudyModes(row).includes(filters.form)) &&
      (!filters.funding ||
        (knownNumber(
          filters.funding === "budget" ? facts.budget : facts.paid,
        ) ?? 0) > 0) &&
      (maxTuition === null ||
        (Number.isFinite(maxTuition) &&
          maxTuition >= 0 &&
          annualTuition !== null &&
          annualTuition <= maxTuition)) &&
      (!filters.year ||
        hseAdmissionYears(row).includes(Number(filters.year))) &&
      (!filters.conditions ||
        hseHasKnownConditions(row, filters.year) ===
          (filters.conditions === "known")) &&
      normalize(
        `${row.title} ${row.code} ${row.campus} ${row.form} ${row.faculty ?? ""} ${row.offering?.title ?? ""} ${row.offering?.profile ?? ""} ${row.program?.tags.join(" ") ?? ""}`,
      ).includes(term)
    );
  });
}

function displayFact<T>({
  value,
  year,
  status,
  sourceUrl,
}: SourcedValue<T>): HseDisplayFact<T> {
  return { value, year, status, sourceUrl };
}

export function hseScoreArchiveData(data: ArchiveData): ArchiveData {
  const score = (value: ArchiveData["records"][number]["budget"]) => ({
    value: value.value,
    status: value.status,
    maximum: value.maximum,
    raw: value.raw,
    rawPublishedValue: value.rawPublishedValue,
    noteRu: value.noteRu,
  });
  return {
    sources: Object.fromEntries(
      Object.entries(data.sources).map(([key, source]) => [
        key,
        { url: source.url },
      ]),
    ),
    records: data.records.map((row) => ({
      id: row.id,
      title: row.title,
      code: row.code,
      codes: row.codes,
      campus: row.campus,
      year: row.year,
      programUrls: row.programUrls,
      budget: score(row.budget),
      paid: score(row.paid),
      source: row.source,
      scopeNoteRu: row.scopeNoteRu,
      identityNoteRu: row.identityNoteRu,
      pageOneBased: row.pageOneBased,
      level: row.level,
    })),
    knownConflicts: data.knownConflicts,
  };
}

export function hseExplorerData(
  programs: Program[],
  offerings: UniversityOffering[],
  masters: HseMasterTuition[],
): {
  programs: HseExplorerProgram[];
  offerings: HseExplorerOffering[];
  masterTuition: HseExplorerMaster[];
} {
  return {
    programs: programs.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      code: row.code,
      campus: row.campus,
      level: row.level,
      form: row.form,
      duration: row.duration,
      faculty: row.faculty,
      sourceUrl: row.sourceUrl,
      admissionsUrl: row.admissionsUrl,
      tags: row.tags,
      admissionYear: row.trust.dataYear,
      tuitionValue: displayFact(row.tuitionValue),
      budgetPlacesValue: displayFact(row.budgetPlacesValue),
      paidPlacesValue: displayFact(row.paidPlacesValue),
      passingScoreValue: displayFact(row.passingScoreValue),
      passingHistory: row.passingHistory.map(displayFact),
      paidPassingHistory: row.paidPassingHistory?.map(displayFact),
    })),
    offerings: offerings
      .filter(
        (row) =>
          row.sourceUrl.includes("/n/education/") ||
          row.level === "Аспирантура",
      )
      .map((row) => ({
        id: row.id,
        code: row.code,
        title: row.title,
        profile: row.profile,
        level: row.level,
        forms: row.forms,
        duration: row.duration,
        sourceUrl: row.sourceUrl,
        programUrl: row.programUrl,
        campus: row.campus,
        publishedPrice: row.publishedPrice,
        admission: row.admissionDetails && {
          priorEducation:
            row.admissionDetails.priorEducation &&
            displayFact(row.admissionDetails.priorEducation),
          schoolBase: row.admissionDetails.schoolBase,
          annualTuition:
            row.admissionDetails.annualTuition &&
            displayFact(row.admissionDetails.annualTuition),
          budgetPlaces:
            row.admissionDetails.budgetPlaces &&
            displayFact(row.admissionDetails.budgetPlaces),
          paidPlaces:
            row.admissionDetails.paidPlaces &&
            displayFact(row.admissionDetails.paidPlaces),
          exams:
            row.admissionDetails.exams &&
            displayFact(row.admissionDetails.exams),
          note: row.admissionDetails.note,
        },
        faculty:
          row.level === "Аспирантура"
            ? (row.sourceSection
                ?.match(/(?:^|;\s*)аспирантская школа:\s*([^;]+)/i)?.[1]
                .trim() ?? null)
            : null,
      })),
    masterTuition: masters.map((row) => ({
      title: row.title,
      code: row.code,
      campus: row.campus,
      form: row.form,
      sourceUrl: row.sourceUrl,
      programUrl: row.programUrl,
      faculty: row.faculty,
      duration: row.duration,
      tuition: displayFact(row.tuition),
      budgetPlaces: displayFact(row.budgetPlaces),
      paidPlaces: displayFact(row.paidPlaces),
      exams: displayFact(row.exams),
    })),
  };
}
