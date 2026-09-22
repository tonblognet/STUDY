import catalogJson from "@/data-sources/universities/msu/catalog-2026.json";
import passingScoresJson from "@/data-sources/universities/msu/passing-scores-2011-2025.json";

export type MguCatalogProgram = {
  page: number;
  faculty: string;
  code: string;
  description: string;
  budget: number | null;
  paid: number | null;
  specialQuota: number | null;
  separateQuota: number | null;
  targetQuota: number | null;
  exams: string;
  examGroups: string[];
};

export type MguPassingScoreRecord = {
  year: number;
  faculty: string;
  program: string;
  code: string | null;
  score: number | null;
  maxScore: number | null;
  firstWaveScore: number | null;
  secondWaveScore: number | null;
  rawScore: string;
  sourceUrl: string;
};

export const MGU_CATALOG_SOURCE = catalogJson.sourceUrl;
export const MGU_SCORE_ARCHIVE_SOURCE = passingScoresJson.archiveUrl;
export const MGU_DORMITORY_SOURCE = "https://osk.msu.ru/d/1/faq/";
export const MGU_MILITARY_SOURCE =
  "https://spa.msu.ru/students/voennaya-podgotovka/";
export const MGU_ADDRESS_SOURCE = "https://international.msu.ru/ru";

export const mguCatalogPrograms = catalogJson.programs as MguCatalogProgram[];
export const mguPassingScoreRecords =
  passingScoresJson.records as MguPassingScoreRecord[];
export const mguPassingScoreYears = [...passingScoresJson.years];

export function getMguProgramTitle(description: string) {
  const quoted = [...description.matchAll(/"([^"]+)"/g)].map(
    (match) => match[1],
  );
  if (description.startsWith("Укрупненная группа"))
    return `${quoted[0] ?? "Науки о Земле"} — многопрофильный конкурс`;
  if (/образовательные программы/i.test(description) && quoted.length > 1)
    return quoted.slice(1).join(" / ");
  if (
    /(?:образовательная |группа образовательных |\s|\()программа/i.test(
      description,
    )
  )
    return quoted.at(-1) ?? quoted[0] ?? description;
  return quoted[0] ?? description;
}

export function getMguProgramLevel(description: string) {
  return description.startsWith("Специальность")
    ? ("Специалитет" as const)
    : ("Бакалавриат" as const);
}

const egeSubjects = [
  "Математика",
  "Русский язык",
  "Физика",
  "Информатика",
  "Химия",
  "Биология",
  "География",
  "История",
  "Обществознание",
  "Литература",
  "Иностранный язык",
];

export function getMguEgeSubjects(program: MguCatalogProgram) {
  const normalized = program.exams.toLocaleLowerCase("ru-RU");
  return egeSubjects.filter((subject) =>
    normalized.includes(`${subject.toLocaleLowerCase("ru-RU")} (егэ)`),
  );
}

export function getMguDvi(program: MguCatalogProgram) {
  return program.examGroups.find((group) => group.includes("ДВИ")) ?? null;
}

export function getMguEgeGroups(program: MguCatalogProgram) {
  return program.examGroups
    .filter((group) => group.includes("ЕГЭ") && !group.includes("ДВИ"))
    .map((group) => ({
      label: `Приоритет ${group.match(/\((\d+)\)$/)?.[1] ?? "—"}`,
      subjects: egeSubjects.filter((subject) =>
        group
          .toLocaleLowerCase("ru-RU")
          .includes(`${subject.toLocaleLowerCase("ru-RU")} (егэ)`),
      ),
    }))
    .filter((group) => group.subjects.length > 0);
}

function normalize(value: string) {
  return value
    .toLocaleLowerCase("ru-RU")
    .replaceAll("ё", "е")
    .replace(/факультет|направление подготовки|специальность/g, "")
    .replace(/[^а-яa-z0-9]+/g, " ")
    .trim();
}

function sameFaculty(left: string, right: string) {
  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);
  return normalizedLeft === normalizedRight;
}

export function getMguProgramPassingHistory(program: MguCatalogProgram) {
  const title = normalize(getMguProgramTitle(program.description));
  return mguPassingScoreYears.flatMap((year) => {
    const facultyRecords = mguPassingScoreRecords.filter(
      (record) =>
        record.year === year &&
        sameFaculty(program.faculty, record.faculty) &&
        (record.code === null || record.code === program.code),
    );
    const exact = facultyRecords.filter(
      (record) => normalize(record.program) === title,
    );
    if (exact.length === 1) return exact;
    return [];
  });
}

const areaByCode: Record<string, string> = {
  "01": "Математика",
  "02": "ИТ",
  "03": "Физика",
  "04": "Химия",
  "05": "Науки о Земле",
  "06": "Биология",
  "09": "ИТ",
  "19": "Биотехнологии",
  "27": "Инженерия",
  "31": "Медицина",
  "33": "Фармация",
  "37": "Психология",
  "38": "Экономика и управление",
  "39": "Социология",
  "40": "Право",
  "41": "Политика и международные отношения",
  "42": "Медиа",
  "43": "Туризм",
  "45": "Языки и филология",
  "46": "История",
  "47": "Философия",
  "50": "Искусство",
  "51": "Культура",
  "54": "Дизайн",
  "55": "Продюсерство",
};

export function getMguProgramTags(program: MguCatalogProgram) {
  return [areaByCode[program.code.slice(0, 2)] ?? "МГУ", "ДВИ"];
}
