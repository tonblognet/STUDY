import type { DataStatus, ExamRequirement, HistoricalPoint, ProgramTrust, SourcedValue } from "@/lib/admissions/types";

export type University = {
  id: string;
  slug: string;
  shortName: string;
  name: string;
  color: string;
  description: string;
  address: string;
  website: string;
  programsCount: number;
};

type Quotas = {
  special: SourcedValue<number>;
  separate: SourcedValue<number>;
  target: SourcedValue<number>;
  general: SourcedValue<number>;
};

export type Program = {
  id: string;
  slug: string;
  universitySlug: string;
  university: string;
  universityShort: string;
  code: string;
  title: string;
  level: "Бакалавриат" | "Специалитет";
  form: "Очная" | "Очно-заочная" | "Заочная";
  duration: string;
  faculty: string | null;
  campus: string | null;
  language: string;
  subjects: string[];
  examRequirements: ExamRequirement[];
  passingScore: number | null;
  passingScoreValue: SourcedValue<number>;
  previousScores: { year: number; score: number | null }[];
  passingHistory: HistoricalPoint[];
  placesHistory: HistoricalPoint[];
  tuitionHistory: HistoricalPoint[];
  competitionHistory: HistoricalPoint[];
  minScore: number | null;
  budgetPlaces: number | null;
  budgetPlacesValue: SourcedValue<number>;
  paidPlaces: number | null;
  paidPlacesValue: SourcedValue<number>;
  tuition: number | null;
  tuitionValue: SourcedValue<number>;
  dvi: string | null;
  dviValue: SourcedValue<string>;
  dviMax: SourcedValue<number>;
  individualAchievementsMax: SourcedValue<number>;
  quotas: Quotas;
  hostel: SourcedValue<boolean>;
  militaryCenter: SourcedValue<boolean>;
  sourceUrl: string;
  admissionsUrl: string;
  updatedAt: string;
  verified: boolean;
  trust: ProgramTrust;
  tags: string[];
};

const CHECKED = "2026-08-05T12:00:00.000Z";
const NEXT = "2026-09-05T12:00:00.000Z";

function sourced<T>(value: T | null, year: number, status: DataStatus, sourceUrl: string, sourceName: string, extra: Partial<SourcedValue<T>> = {}): SourcedValue<T> {
  return { value, year, status, sourceUrl, sourceName, retrievedAt: CHECKED, checkedAt: CHECKED, checkedBy: "Редакция Поступай", nextReviewAt: NEXT, ...extra };
}

const unknownNumber = (year: number, url: string, name: string, note: string) => sourced<number>(null, year, "not_published", url, name, { note });
const unknownBoolean = (year: number, url: string, name: string, note: string) => sourced<boolean>(null, year, "not_published", url, name, { note });
const naNumber = (year: number, url: string, name: string) => sourced<number>(null, year, "not_applicable", url, name);
const naString = (year: number, url: string, name: string) => sourced<string>(null, year, "not_applicable", url, name);

export const universities: University[] = [
  { id: "hse", slug: "hse", shortName: "ВШЭ", name: "Национальный исследовательский университет «Высшая школа экономики»", color: "#2968d9", description: "Официальные сведения первой очереди: программа, испытания, места, стоимость и проходные баллы из сводного документа приёмной кампании.", address: "Москва", website: "https://www.hse.ru", programsCount: 1 },
  { id: "mai", slug: "mai", shortName: "МАИ", name: "Московский авиационный институт (национальный исследовательский университет)", color: "#265b8f", description: "Сведения о направлениях и контрольных цифрах приёма с официального портала приёмной комиссии.", address: "Москва", website: "https://mai.ru", programsCount: 1 },
  { id: "mipt", slug: "mipt", shortName: "МФТИ", name: "Московский физико-технический институт (национальный исследовательский университет)", color: "#b24a32", description: "Контрольные цифры приёма 2026 из официальной таблицы приёмной комиссии.", address: "Долгопрудный, Московский регион", website: "https://mipt.ru", programsCount: 1 },
  { id: "misis", slug: "misis", shortName: "МИСИС", name: "Национальный исследовательский технологический университет МИСИС", color: "#4b4f73", description: "Параметры программы 2026 с официальной страницы поступления.", address: "Москва", website: "https://misis.ru", programsCount: 1 },
  { id: "mpei", slug: "mpei", shortName: "МЭИ", name: "Национальный исследовательский университет «МЭИ»", color: "#d35c38", description: "Испытания, места, проходной балл и стоимость из официального перечня программ 2026.", address: "Москва", website: "https://mpei.ru", programsCount: 1 },
  { id: "mephi", slug: "mephi", shortName: "МИФИ", name: "Национальный исследовательский ядерный университет «МИФИ»", color: "#2865c7", description: "Стоимость и параметры обучения с официального портала приёмной комиссии.", address: "Москва", website: "https://mephi.ru", programsCount: 1 },
  { id: "rudn", slug: "rudn", shortName: "РУДН", name: "Российский университет дружбы народов имени Патриса Лумумбы", color: "#16836a", description: "Контрольные цифры приёма из официального приказа на 2026 год.", address: "Москва", website: "https://www.rudn.ru", programsCount: 1 },
  { id: "ranepa", slug: "ranepa", shortName: "РАНХиГС", name: "Российская академия народного хозяйства и государственной службы при Президенте Российской Федерации", color: "#a84272", description: "Программа и вступительные испытания из официального перечня 2026.", address: "Москва", website: "https://www.ranepa.ru", programsCount: 1 },
  { id: "msu", slug: "mgu", shortName: "МГУ", name: "Московский государственный университет имени М. В. Ломоносова", color: "#6b52e5", description: "Сведения с официальной страницы приёма экономического факультета.", address: "Москва", website: "https://www.msu.ru", programsCount: 1 },
  { id: "rea", slug: "rea", shortName: "РЭУ", name: "Российский экономический университет имени Г. В. Плеханова", color: "#8c3d44", description: "Параметры программы 2026 из официального каталога образовательных программ.", address: "Москва", website: "https://www.rea.ru", programsCount: 1 },
];

const bySlug = Object.fromEntries(universities.map((university) => [university.slug, university]));

const hseSource = "https://www.hse.ru/mirror/pubs/share/1162982432.pdf";
const hsePass = sourced(291, 2025, "verified", hseSource, "НИУ ВШЭ", { sourceDocumentTitle: "Сводная информация по программам бакалавриата и специалитета", sourcePage: 6, sourceSection: "Экономика, 38.03.01", note: "Проходной балл на бюджетные места по итогам приёма 2025 года." });
const hsePlaces = sourced(100, 2026, "verified", hseSource, "НИУ ВШЭ", { sourceDocumentTitle: "Сводная информация по программам бакалавриата и специалитета", sourcePage: 6, sourceSection: "Экономика, 38.03.01" });
const hsePaid = sourced(165, 2026, "verified", hseSource, "НИУ ВШЭ", { sourceDocumentTitle: "Сводная информация по программам бакалавриата и специалитета", sourcePage: 6, sourceSection: "Экономика, 38.03.01" });
const hseTuition = sourced(1_000_000, 2026, "verified", hseSource, "НИУ ВШЭ", { sourceDocumentTitle: "Сводная информация по программам бакалавриата и специалитета", sourcePage: 6, sourceSection: "Экономика, 38.03.01", note: "В документе стоимость дана в тыс. рублей за год: 1 000." });

const programsBase: Program[] = [];

function program(input: Omit<Program, "university" | "universityShort" | "previousScores" | "verified" | "updatedAt">): Program {
  const university = bySlug[input.universitySlug];
  const previousScores = input.passingHistory.map((point) => ({ year: point.year, score: point.value }));
  return { ...input, university: university.name, universityShort: university.shortName, previousScores, verified: input.trust.status === "verified", updatedAt: new Intl.DateTimeFormat("ru-RU", { dateStyle: "long", timeZone: "Europe/Moscow" }).format(new Date(input.trust.checkedAt)) };
}

programsBase.push(program({
  id: "hse-economics", slug: "hse-economics", universitySlug: "hse", code: "38.03.01", title: "Экономика", level: "Бакалавриат", form: "Очная", duration: "4 года", faculty: null, campus: "Москва", language: "Русский", subjects: ["Математика", "Русский язык", "Обществознание / Информатика / Иностранный язык"],
  examRequirements: [
    { id: "hse-math", label: "Обязательный предмет", subjects: ["Математика"], minimum: sourced(65, 2026, "verified", hseSource, "НИУ ВШЭ", { sourcePage: 6, sourceSection: "Экономика, вступительные испытания" }), required: true },
    { id: "hse-alt", label: "Один предмет на выбор", subjects: ["Обществознание", "Информатика", "Иностранный язык"], minimum: sourced(65, 2026, "verified", hseSource, "НИУ ВШЭ", { sourcePage: 6, sourceSection: "Экономика, вступительные испытания" }), required: true },
    { id: "hse-rus", label: "Обязательный предмет", subjects: ["Русский язык"], minimum: sourced(65, 2026, "verified", hseSource, "НИУ ВШЭ", { sourcePage: 6, sourceSection: "Экономика, вступительные испытания" }), required: true },
  ],
  passingScore: hsePass.value, passingScoreValue: hsePass, passingHistory: [sourced<number>(null, 2023, "not_published", hseSource, "НИУ ВШЭ", { note: "В обработанном документе нет значения за 2023 год." }), sourced<number>(null, 2024, "not_published", hseSource, "НИУ ВШЭ", { note: "В обработанном документе нет значения за 2024 год." }), hsePass],
  placesHistory: [sourced<number>(null, 2023, "not_published", hseSource, "НИУ ВШЭ"), sourced<number>(null, 2024, "not_published", hseSource, "НИУ ВШЭ"), sourced<number>(null, 2025, "not_published", hseSource, "НИУ ВШЭ"), hsePlaces], tuitionHistory: [hseTuition], competitionHistory: [unknownNumber(2025, hseSource, "НИУ ВШЭ", "Конкурс на место не указан в обработанном разделе.")],
  minScore: 195, budgetPlaces: hsePlaces.value, budgetPlacesValue: hsePlaces, paidPlaces: hsePaid.value, paidPlacesValue: hsePaid, tuition: hseTuition.value, tuitionValue: hseTuition,
  dvi: null, dviValue: naString(2026, hseSource, "НИУ ВШЭ"), dviMax: naNumber(2026, hseSource, "НИУ ВШЭ"), individualAchievementsMax: unknownNumber(2026, hseSource, "НИУ ВШЭ", "Предел индивидуальных достижений не указан в сводной строке."),
  quotas: { special: unknownNumber(2026, hseSource, "НИУ ВШЭ", "Требуется отдельный план по квотам."), separate: unknownNumber(2026, hseSource, "НИУ ВШЭ", "Требуется отдельный план по квотам."), target: unknownNumber(2026, hseSource, "НИУ ВШЭ", "Требуется отдельный план по квотам."), general: hsePlaces }, hostel: unknownBoolean(2026, hseSource, "НИУ ВШЭ", "Не проверялось в документе программы."), militaryCenter: unknownBoolean(2026, hseSource, "НИУ ВШЭ", "Не проверялось в документе программы."),
  sourceUrl: hseSource, admissionsUrl: "https://ba.hse.ru/", trust: { dataYear: 2026, status: "verified", completeness: 76, checkedAt: CHECKED, checkedBy: "Редакция Поступай", nextReviewAt: NEXT, sourceName: "НИУ ВШЭ", sourceDocumentTitle: "Сводная информация по программам бакалавриата и специалитета", sourcePage: 6, sourceSection: "Экономика, 38.03.01", note: "Показатели относятся к разным годам и подписаны отдельно." }, tags: ["Экономика", "Официальные данные"]
}));

const maiSource = "https://priem.mai.ru/foreign-applicants/bachelor/programs/";
programsBase.push(program({
  id: "mai-ami", slug: "mai-applied-math", universitySlug: "mai", code: "01.03.02", title: "Прикладная математика и информатика", level: "Бакалавриат", form: "Очная", duration: "4 года", faculty: null, campus: "Москва", language: "Русский", subjects: ["Математика", "Русский язык", "Информатика / Физика"],
  examRequirements: [
    { id: "mai-math", label: "Обязательный предмет", subjects: ["Математика"], minimum: unknownNumber(2026, maiSource, "МАИ", "Минимум требует сверки с отдельным документом 2026."), required: true },
    { id: "mai-alt", label: "Один предмет на выбор", subjects: ["Информатика", "Физика"], minimum: unknownNumber(2026, maiSource, "МАИ", "Минимум требует сверки с отдельным документом 2026."), required: true },
    { id: "mai-rus", label: "Обязательный предмет", subjects: ["Русский язык"], minimum: unknownNumber(2026, maiSource, "МАИ", "Минимум требует сверки с отдельным документом 2026."), required: true },
  ],
  passingScore: null, passingScoreValue: sourced<number>(null, 2025, "pending_review", maiSource, "МАИ", { sourceSection: "01.03.02, Москва, очная форма", note: "На странице показан балл 275, но в извлечённом заголовке таблицы не подтверждён год; до ручной проверки не публикуется как проходной." }), passingHistory: [],
  placesHistory: [sourced(125, 2026, "verified", maiSource, "МАИ", { sourceSection: "01.03.02, Москва, очная форма" })], tuitionHistory: [], competitionHistory: [], minScore: null,
  budgetPlaces: 125, budgetPlacesValue: sourced(125, 2026, "verified", maiSource, "МАИ", { sourceSection: "01.03.02, Москва, очная форма" }), paidPlaces: 55, paidPlacesValue: sourced(55, 2026, "verified", maiSource, "МАИ", { sourceSection: "01.03.02, Москва, очная форма" }), tuition: null, tuitionValue: unknownNumber(2026, "https://priem.mai.ru/orders/plan/cost/", "МАИ", "Документ стоимости обнаружен, сопоставление с программой ожидает проверки."),
  dvi: null, dviValue: naString(2026, maiSource, "МАИ"), dviMax: naNumber(2026, maiSource, "МАИ"), individualAchievementsMax: unknownNumber(2026, maiSource, "МАИ", "Не указано в строке программы."),
  quotas: { special: sourced(13, 2026, "verified", maiSource, "МАИ", { sourceSection: "01.03.02, квоты" }), separate: sourced(13, 2026, "verified", maiSource, "МАИ", { sourceSection: "01.03.02, квоты" }), target: sourced(8, 2026, "verified", maiSource, "МАИ", { sourceSection: "01.03.02, квоты" }), general: sourced(91, 2026, "verified", maiSource, "МАИ", { sourceSection: "01.03.02, общий конкурс" }) }, hostel: unknownBoolean(2026, maiSource, "МАИ", "Не указано в таблице программы."), militaryCenter: unknownBoolean(2026, maiSource, "МАИ", "Не указано в таблице программы."),
  sourceUrl: maiSource, admissionsUrl: "https://priem.mai.ru/", trust: { dataYear: 2026, status: "pending_review", completeness: 55, checkedAt: CHECKED, checkedBy: "Редакция Поступай", nextReviewAt: NEXT, sourceName: "Приёмная комиссия МАИ", sourceSection: "01.03.02, Москва, очная форма", note: "Места и квоты подтверждены; проходной балл не опубликован до подтверждения года." }, tags: ["Математика", "ИТ"]
}));

const miptSource = "https://pk.mipt.ru/bachelor/2026_places/";
programsBase.push(program({
  id: "mipt-ami", slug: "mipt-applied-math", universitySlug: "mipt", code: "01.03.02", title: "Прикладная математика и информатика", level: "Бакалавриат", form: "Очная", duration: "4 года", faculty: "ФПМИ (агрегировано по направлению)", campus: "Долгопрудный", language: "Русский", subjects: [], examRequirements: [], passingScore: null, passingScoreValue: unknownNumber(2025, miptSource, "МФТИ", "На странице плана приёма нет проходного балла."), passingHistory: [],
  placesHistory: [sourced(180, 2026, "verified", miptSource, "МФТИ", { sourceSection: "01.03.02, контрольные цифры приёма" })], tuitionHistory: [], competitionHistory: [], minScore: null,
  budgetPlaces: 180, budgetPlacesValue: sourced(180, 2026, "verified", miptSource, "МФТИ", { sourceSection: "01.03.02, контрольные цифры приёма" }), paidPlaces: 105, paidPlacesValue: sourced(105, 2026, "verified", miptSource, "МФТИ", { sourceSection: "01.03.02, платное обучение" }), tuition: null, tuitionValue: unknownNumber(2026, miptSource, "МФТИ", "Стоимость отсутствует в таблице мест."), dvi: null, dviValue: sourced<string>(null, 2026, "pending_review", miptSource, "МФТИ", { note: "Испытания проверяются в отдельном документе." }), dviMax: sourced<number>(null, 2026, "pending_review", miptSource, "МФТИ"), individualAchievementsMax: unknownNumber(2026, miptSource, "МФТИ", "Не указано в плане мест."),
  quotas: { special: sourced(18, 2026, "verified", miptSource, "МФТИ"), separate: sourced(18, 2026, "verified", miptSource, "МФТИ"), target: sourced(11, 2026, "verified", miptSource, "МФТИ"), general: sourced(133, 2026, "verified", miptSource, "МФТИ") }, hostel: unknownBoolean(2026, miptSource, "МФТИ", "Не указано в плане мест."), militaryCenter: unknownBoolean(2026, miptSource, "МФТИ", "Не указано в плане мест."),
  sourceUrl: miptSource, admissionsUrl: "https://pk.mipt.ru/", trust: { dataYear: 2026, status: "verified", completeness: 42, checkedAt: CHECKED, checkedBy: "Редакция Поступай", nextReviewAt: NEXT, sourceName: "Приёмная комиссия МФТИ", sourceSection: "01.03.02", note: "Проверены места и квоты; условия и стоимость пока не сопоставлены." }, tags: ["Математика", "ИТ"]
}));

const misisSource = "https://misis.ru/applicants/admission/baccalaureate-and-specialty/faculties/analysis/";
programsBase.push(program({
  id: "misis-analysis", slug: "misis-system-analysis", universitySlug: "misis", code: "не опубликован", title: "Системный анализ и управление", level: "Бакалавриат", form: "Очная", duration: "4 года", faculty: null, campus: "Москва", language: "Русский", subjects: ["Математика", "Русский язык", "Физика / Химия / Информатика"],
  examRequirements: [
    { id: "misis-math", label: "Обязательный предмет", subjects: ["Математика"], minimum: sourced(60, 2026, "verified", misisSource, "НИТУ МИСИС", { sourceSection: "Минимальные баллы, бюджет" }), required: true },
    { id: "misis-rus", label: "Обязательный предмет", subjects: ["Русский язык"], minimum: sourced(60, 2026, "verified", misisSource, "НИТУ МИСИС", { sourceSection: "Минимальные баллы, бюджет" }), required: true },
    { id: "misis-alt", label: "Один предмет на выбор", subjects: ["Физика", "Химия", "Информатика"], minimum: sourced(60, 2026, "verified", misisSource, "НИТУ МИСИС", { sourceSection: "Минимальные баллы, бюджет" }), required: true },
  ],
  passingScore: null, passingScoreValue: sourced<number>(null, 2025, "not_applicable", misisSource, "НИТУ МИСИС", { note: "Программа обозначена вузом как новая в 2026 году; исторического проходного балла нет." }), passingHistory: [], placesHistory: [sourced(5, 2026, "verified", misisSource, "НИТУ МИСИС", { sourceSection: "Количество мест" })], tuitionHistory: [sourced(440_000, 2026, "verified", misisSource, "НИТУ МИСИС", { sourceSection: "Стоимость обучения" })], competitionHistory: [], minScore: 180,
  budgetPlaces: 5, budgetPlacesValue: sourced(5, 2026, "verified", misisSource, "НИТУ МИСИС", { sourceSection: "Количество мест" }), paidPlaces: 40, paidPlacesValue: sourced(40, 2026, "verified", misisSource, "НИТУ МИСИС", { sourceSection: "Количество мест" }), tuition: 440_000, tuitionValue: sourced(440_000, 2026, "verified", misisSource, "НИТУ МИСИС", { sourceSection: "Стоимость обучения" }), dvi: null, dviValue: naString(2026, misisSource, "НИТУ МИСИС"), dviMax: naNumber(2026, misisSource, "НИТУ МИСИС"), individualAchievementsMax: unknownNumber(2026, misisSource, "НИТУ МИСИС", "Не указано на странице программы."),
  quotas: { special: unknownNumber(2026, misisSource, "НИТУ МИСИС", "Не указано на странице программы."), separate: unknownNumber(2026, misisSource, "НИТУ МИСИС", "Не указано на странице программы."), target: unknownNumber(2026, misisSource, "НИТУ МИСИС", "Не указано на странице программы."), general: unknownNumber(2026, misisSource, "НИТУ МИСИС", "Не указано на странице программы.") }, hostel: unknownBoolean(2026, misisSource, "НИТУ МИСИС", "Требуется отдельный источник."), militaryCenter: unknownBoolean(2026, misisSource, "НИТУ МИСИС", "Требуется отдельный источник."),
  sourceUrl: misisSource, admissionsUrl: "https://misis.ru/applicants/", trust: { dataYear: 2026, status: "verified", completeness: 68, checkedAt: CHECKED, checkedBy: "Редакция Поступай", nextReviewAt: NEXT, sourceName: "НИТУ МИСИС", sourceSection: "Системный анализ и управление", note: "Новая программа: исторический проходной балл неприменим." }, tags: ["Инженерия", "Новая программа"]
}));

const mpeiSource = "https://pk.mpei.ru/info/speclist";
programsBase.push(program({
  id: "mpei-applied-informatics", slug: "mpei-applied-informatics", universitySlug: "mpei", code: "09.03.03", title: "Прикладная информатика в экономике", level: "Бакалавриат", form: "Очная", duration: "4 года", faculty: null, campus: "Москва", language: "Русский", subjects: ["Русский язык", "Математика", "Физика / Информатика"],
  examRequirements: [
    { id: "mpei-rus", label: "Обязательный предмет", subjects: ["Русский язык"], minimum: unknownNumber(2026, mpeiSource, "НИУ МЭИ", "Минимум не извлечён из сводной строки."), required: true },
    { id: "mpei-math", label: "Обязательный предмет", subjects: ["Математика"], minimum: unknownNumber(2026, mpeiSource, "НИУ МЭИ", "Минимум не извлечён из сводной строки."), required: true },
    { id: "mpei-alt", label: "Один предмет на выбор", subjects: ["Физика", "Информатика"], minimum: unknownNumber(2026, mpeiSource, "НИУ МЭИ", "Минимум не извлечён из сводной строки."), required: true },
  ],
  passingScore: 261, passingScoreValue: sourced(261, 2025, "verified", mpeiSource, "Приёмная комиссия НИУ МЭИ", { sourceSection: "09.03.03, Прикладная информатика в экономике" }), passingHistory: [sourced(261, 2025, "verified", mpeiSource, "Приёмная комиссия НИУ МЭИ")], placesHistory: [sourced(30, 2026, "verified", mpeiSource, "Приёмная комиссия НИУ МЭИ")], tuitionHistory: [sourced(420_000, 2026, "verified", mpeiSource, "Приёмная комиссия НИУ МЭИ")], competitionHistory: [], minScore: null,
  budgetPlaces: 30, budgetPlacesValue: sourced(30, 2026, "verified", mpeiSource, "Приёмная комиссия НИУ МЭИ"), paidPlaces: 60, paidPlacesValue: sourced(60, 2026, "verified", mpeiSource, "Приёмная комиссия НИУ МЭИ"), tuition: 420_000, tuitionValue: sourced(420_000, 2026, "verified", mpeiSource, "Приёмная комиссия НИУ МЭИ"), dvi: null, dviValue: naString(2026, mpeiSource, "Приёмная комиссия НИУ МЭИ"), dviMax: naNumber(2026, mpeiSource, "Приёмная комиссия НИУ МЭИ"), individualAchievementsMax: unknownNumber(2026, mpeiSource, "Приёмная комиссия НИУ МЭИ", "Не указано в строке программы."),
  quotas: { special: sourced(3, 2026, "verified", mpeiSource, "Приёмная комиссия НИУ МЭИ"), separate: sourced(3, 2026, "verified", mpeiSource, "Приёмная комиссия НИУ МЭИ"), target: sourced(1, 2026, "verified", mpeiSource, "Приёмная комиссия НИУ МЭИ"), general: sourced(23, 2026, "verified", mpeiSource, "Приёмная комиссия НИУ МЭИ", { note: "Вычислено как 30 - 3 - 3 - 1 по данным той же строки." }) }, hostel: unknownBoolean(2026, mpeiSource, "НИУ МЭИ", "Требуется отдельный источник."), militaryCenter: unknownBoolean(2026, mpeiSource, "НИУ МЭИ", "Требуется отдельный источник."),
  sourceUrl: mpeiSource, admissionsUrl: "https://pk.mpei.ru/", trust: { dataYear: 2026, status: "verified", completeness: 72, checkedAt: CHECKED, checkedBy: "Редакция Поступай", nextReviewAt: NEXT, sourceName: "Приёмная комиссия НИУ МЭИ", sourceSection: "09.03.03, Прикладная информатика в экономике" }, tags: ["ИТ", "Экономика"]
}));

const mephiSource = "https://admission.mephi.ru/admission/baccalaureate-and-specialty/education/paid-formation";
programsBase.push(program({
  id: "mephi-nuclear", slug: "mephi-nuclear-physics", universitySlug: "mephi", code: "14.03.02", title: "Ядерные физика и технологии", level: "Бакалавриат", form: "Очная", duration: "4 года", faculty: null, campus: "Москва", language: "Русский", subjects: [], examRequirements: [], passingScore: null, passingScoreValue: unknownNumber(2025, mephiSource, "НИЯУ МИФИ", "На странице стоимости нет проходного балла."), passingHistory: [], placesHistory: [], tuitionHistory: [sourced(600_000, 2026, "verified", mephiSource, "Приёмная комиссия НИЯУ МИФИ", { sourceSection: "14.03.02", note: "Годовая цена вычислена из двух семестров по 300 000 ₽; исходная семестровая цена сохранена в примечании." })], competitionHistory: [], minScore: null,
  budgetPlaces: null, budgetPlacesValue: unknownNumber(2026, mephiSource, "НИЯУ МИФИ", "На странице стоимости нет плана бюджетных мест."), paidPlaces: null, paidPlacesValue: unknownNumber(2026, mephiSource, "НИЯУ МИФИ", "На странице стоимости нет плана платных мест."), tuition: 600_000, tuitionValue: sourced(600_000, 2026, "verified", mephiSource, "Приёмная комиссия НИЯУ МИФИ", { sourceSection: "14.03.02", note: "2 × 300 000 ₽ за семестр." }), dvi: null, dviValue: sourced<string>(null, 2026, "pending_review", mephiSource, "НИЯУ МИФИ", { note: "Набор испытаний проверяется по отдельному перечню." }), dviMax: sourced<number>(null, 2026, "pending_review", mephiSource, "НИЯУ МИФИ"), individualAchievementsMax: unknownNumber(2026, mephiSource, "НИЯУ МИФИ", "Не указано на странице стоимости."),
  quotas: { special: unknownNumber(2026, mephiSource, "НИЯУ МИФИ", "Требуется план приёма."), separate: unknownNumber(2026, mephiSource, "НИЯУ МИФИ", "Требуется план приёма."), target: unknownNumber(2026, mephiSource, "НИЯУ МИФИ", "Требуется план приёма."), general: unknownNumber(2026, mephiSource, "НИЯУ МИФИ", "Требуется план приёма.") }, hostel: unknownBoolean(2026, mephiSource, "НИЯУ МИФИ", "Требуется отдельный источник."), militaryCenter: unknownBoolean(2026, mephiSource, "НИЯУ МИФИ", "Требуется отдельный источник."),
  sourceUrl: mephiSource, admissionsUrl: "https://admission.mephi.ru/", trust: { dataYear: 2026, status: "pending_review", completeness: 32, checkedAt: CHECKED, checkedBy: "Редакция Поступай", nextReviewAt: NEXT, sourceName: "Приёмная комиссия НИЯУ МИФИ", sourceSection: "14.03.02", note: "Подтверждена стоимость; остальные показатели не подменяются данными других страниц." }, tags: ["Физика", "Ядерные технологии"]
}));

const rudnSource = "https://admission.rudn.ru/pk/2026/count/kcp_26_1.pdf";
programsBase.push(program({
  id: "rudn-ami", slug: "rudn-applied-math", universitySlug: "rudn", code: "01.03.02", title: "Прикладная математика и информатика", level: "Бакалавриат", form: "Очная", duration: "4 года", faculty: "Факультет физико-математических и естественных наук", campus: "Москва", language: "Русский", subjects: [], examRequirements: [], passingScore: null, passingScoreValue: unknownNumber(2025, rudnSource, "РУДН", "В приказе о КЦП нет проходного балла."), passingHistory: [], placesHistory: [sourced(49, 2026, "verified", rudnSource, "РУДН", { sourceDocumentTitle: "Количество мест для приёма в 2026 году", sourcePage: 2, sourceSection: "Факультет физико-математических и естественных наук, 01.03.02" })], tuitionHistory: [], competitionHistory: [], minScore: null,
  budgetPlaces: 49, budgetPlacesValue: sourced(49, 2026, "verified", rudnSource, "РУДН", { sourceDocumentTitle: "Количество мест для приёма в 2026 году", sourcePage: 2, sourceSection: "Факультет физико-математических и естественных наук, 01.03.02" }), paidPlaces: null, paidPlacesValue: unknownNumber(2026, rudnSource, "РУДН", "В обработанной таблице КЦП платные места не указаны."), tuition: null, tuitionValue: unknownNumber(2026, rudnSource, "РУДН", "В приказе о КЦП нет стоимости."), dvi: null, dviValue: sourced<string>(null, 2026, "pending_review", rudnSource, "РУДН", { note: "Испытания проверяются по правилам приёма." }), dviMax: sourced<number>(null, 2026, "pending_review", rudnSource, "РУДН"), individualAchievementsMax: unknownNumber(2026, rudnSource, "РУДН", "Не указано в плане мест."),
  quotas: { special: unknownNumber(2026, rudnSource, "РУДН", "Не выделено в обработанной строке."), separate: unknownNumber(2026, rudnSource, "РУДН", "Не выделено в обработанной строке."), target: unknownNumber(2026, rudnSource, "РУДН", "Не выделено в обработанной строке."), general: unknownNumber(2026, rudnSource, "РУДН", "Не выделено в обработанной строке.") }, hostel: unknownBoolean(2026, rudnSource, "РУДН", "Требуется отдельный официальный источник."), militaryCenter: unknownBoolean(2026, rudnSource, "РУДН", "Требуется отдельный официальный источник."),
  sourceUrl: rudnSource, admissionsUrl: "https://admission.rudn.ru/", trust: { dataYear: 2026, status: "verified", completeness: 28, checkedAt: CHECKED, checkedBy: "Редакция Поступай", nextReviewAt: NEXT, sourceName: "РУДН", sourceDocumentTitle: "Количество мест для приёма в 2026 году", sourcePage: 2, sourceSection: "Факультет физико-математических и естественных наук, 01.03.02", note: "Опубликовано только подтверждённое число бюджетных мест." }, tags: ["Математика", "ИТ"]
}));

const ranepaSource = "https://www.ranepa.ru/upload/doc/pk/2026/Perechen_VI-2026.pdf.pdf";
programsBase.push(program({
  id: "ranepa-digital", slug: "ranepa-digital-systems", universitySlug: "ranepa", code: "09.03.03", title: "Цифровые технологии и разработка информационных систем", level: "Бакалавриат", form: "Очная", duration: "4 года", faculty: "Институт экономики, математики и информационных технологий", campus: "Москва", language: "Русский", subjects: [], examRequirements: [], passingScore: null, passingScoreValue: unknownNumber(2025, ranepaSource, "РАНХиГС", "В перечне испытаний нет проходного балла."), passingHistory: [], placesHistory: [], tuitionHistory: [], competitionHistory: [], minScore: null,
  budgetPlaces: null, budgetPlacesValue: sourced<number>(null, 2026, "pending_review", ranepaSource, "РАНХиГС", { sourcePage: 3, sourceSection: "09.03.03", note: "Программа помечена как бюджетная; точное число мест требует сопоставления с планом приёма." }), paidPlaces: null, paidPlacesValue: unknownNumber(2026, ranepaSource, "РАНХиГС", "Не указано в перечне испытаний."), tuition: null, tuitionValue: unknownNumber(2026, ranepaSource, "РАНХиГС", "Не указано в перечне испытаний."), dvi: null, dviValue: sourced<string>(null, 2026, "pending_review", ranepaSource, "РАНХиГС", { note: "Требуется извлечь полный набор испытаний из таблицы." }), dviMax: sourced<number>(null, 2026, "pending_review", ranepaSource, "РАНХиГС"), individualAchievementsMax: unknownNumber(2026, ranepaSource, "РАНХиГС", "Не указано в перечне испытаний."),
  quotas: { special: unknownNumber(2026, ranepaSource, "РАНХиГС", "Требуется план приёма."), separate: unknownNumber(2026, ranepaSource, "РАНХиГС", "Требуется план приёма."), target: unknownNumber(2026, ranepaSource, "РАНХиГС", "Требуется план приёма."), general: unknownNumber(2026, ranepaSource, "РАНХиГС", "Требуется план приёма.") }, hostel: unknownBoolean(2026, ranepaSource, "РАНХиГС", "Требуется отдельный источник."), militaryCenter: unknownBoolean(2026, ranepaSource, "РАНХиГС", "Требуется отдельный источник."),
  sourceUrl: ranepaSource, admissionsUrl: "https://www.ranepa.ru/bakalavriat/", trust: { dataYear: 2026, status: "pending_review", completeness: 24, checkedAt: CHECKED, checkedBy: "Редакция Поступай", nextReviewAt: NEXT, sourceName: "РАНХиГС", sourceDocumentTitle: "Перечень вступительных испытаний 2026", sourcePage: 3, sourceSection: "09.03.03", note: "Идентичность программы подтверждена; числовые показатели ещё не сопоставлены." }, tags: ["ИТ", "Информационные системы"]
}));

const msuSource = "https://www.econ.msu.ru/entrance/bachelor/2026/";
programsBase.push(program({
  id: "msu-economics", slug: "mgu-economics", universitySlug: "mgu", code: "38.03.01", title: "Экономика", level: "Бакалавриат", form: "Очная", duration: "4 года", faculty: "Экономический факультет", campus: "Москва", language: "Русский", subjects: ["Математика", "Русский язык", "Обществознание / История / Иностранный язык", "ДВИ по математике"], examRequirements: [], passingScore: null, passingScoreValue: unknownNumber(2025, msuSource, "Экономический факультет МГУ", "На странице кампании 2026 нет итогового балла последнего зачисленного за 2025 год."), passingHistory: [], placesHistory: [], tuitionHistory: [], competitionHistory: [], minScore: null,
  budgetPlaces: null, budgetPlacesValue: unknownNumber(2026, msuSource, "Экономический факультет МГУ", "Число мест требует сверки с планом приёма."), paidPlaces: null, paidPlacesValue: unknownNumber(2026, msuSource, "Экономический факультет МГУ", "Число мест требует сверки с планом приёма."), tuition: null, tuitionValue: sourced<number>(null, 2026, "pending_review", msuSource, "Экономический факультет МГУ", { note: "Страница приводит ориентировочную стоимость; до приказа она не публикуется как точная." }), dvi: "Математика", dviValue: sourced("Математика", 2026, "verified", msuSource, "Экономический факультет МГУ", { sourceSection: "Вступительные испытания" }), dviMax: sourced<number>(null, 2026, "pending_review", msuSource, "Экономический факультет МГУ", { note: "Максимум ДВИ требует сверки с правилами приёма." }), individualAchievementsMax: unknownNumber(2026, msuSource, "Экономический факультет МГУ", "Не подтверждено на странице программы."),
  quotas: { special: unknownNumber(2026, msuSource, "МГУ", "Требуется план приёма."), separate: unknownNumber(2026, msuSource, "МГУ", "Требуется план приёма."), target: unknownNumber(2026, msuSource, "МГУ", "Требуется план приёма."), general: unknownNumber(2026, msuSource, "МГУ", "Требуется план приёма.") }, hostel: unknownBoolean(2026, msuSource, "МГУ", "Требуется отдельный источник."), militaryCenter: unknownBoolean(2026, msuSource, "МГУ", "Требуется отдельный источник."),
  sourceUrl: msuSource, admissionsUrl: msuSource, trust: { dataYear: 2026, status: "pending_review", completeness: 30, checkedAt: CHECKED, checkedBy: "Редакция Поступай", nextReviewAt: NEXT, sourceName: "Экономический факультет МГУ", sourceSection: "Приёмная кампания 2026", note: "ДВИ подтверждено; ориентировочная цена не показана как точная." }, tags: ["Экономика", "ДВИ"]
}));

const reaSource = "https://www.rea.ru/~ed-program/c88bd4a72ab29c65152ad515b3d23beb";
programsBase.push(program({
  id: "rea-international-law", slug: "rea-international-law", universitySlug: "rea", code: "40.03.01", title: "Международное право и сравнительное правоведение", level: "Бакалавриат", form: "Очная", duration: "4 года", faculty: null, campus: "Москва", language: "Русский", subjects: ["Обществознание", "Русский язык", "Иностранный язык / Информатика / История / Математика"], examRequirements: [], passingScore: null, passingScoreValue: unknownNumber(2025, reaSource, "РЭУ им. Г. В. Плеханова", "На странице приведено старое значение 2022 года; оно не используется для кампании 2026."), passingHistory: [], placesHistory: [], tuitionHistory: [sourced(575_000, 2026, "verified", reaSource, "РЭУ им. Г. В. Плеханова", { sourceSection: "Стоимость обучения" })], competitionHistory: [], minScore: null,
  budgetPlaces: null, budgetPlacesValue: sourced<number>(null, 2026, "not_published", reaSource, "РЭУ им. Г. В. Плеханова", { note: "Бюджетные места на странице программы не опубликованы." }), paidPlaces: 152, paidPlacesValue: sourced(152, 2026, "verified", reaSource, "РЭУ им. Г. В. Плеханова", { sourceSection: "Количество мест" }), tuition: 575_000, tuitionValue: sourced(575_000, 2026, "verified", reaSource, "РЭУ им. Г. В. Плеханова", { sourceSection: "Стоимость обучения" }), dvi: null, dviValue: naString(2026, reaSource, "РЭУ им. Г. В. Плеханова"), dviMax: naNumber(2026, reaSource, "РЭУ им. Г. В. Плеханова"), individualAchievementsMax: unknownNumber(2026, reaSource, "РЭУ им. Г. В. Плеханова", "Не указано на странице программы."),
  quotas: { special: unknownNumber(2026, reaSource, "РЭУ им. Г. В. Плеханова", "Не опубликовано для этой платной программы."), separate: unknownNumber(2026, reaSource, "РЭУ им. Г. В. Плеханова", "Не опубликовано для этой платной программы."), target: unknownNumber(2026, reaSource, "РЭУ им. Г. В. Плеханова", "Не опубликовано для этой платной программы."), general: unknownNumber(2026, reaSource, "РЭУ им. Г. В. Плеханова", "Не опубликовано для этой платной программы.") }, hostel: unknownBoolean(2026, reaSource, "РЭУ им. Г. В. Плеханова", "Требуется отдельный источник."), militaryCenter: unknownBoolean(2026, reaSource, "РЭУ им. Г. В. Плеханова", "Требуется отдельный источник."),
  sourceUrl: reaSource, admissionsUrl: "https://www.rea.ru/ru/org/managements/priem/Pages/default.aspx", trust: { dataYear: 2026, status: "verified", completeness: 58, checkedAt: CHECKED, checkedBy: "Редакция Поступай", nextReviewAt: NEXT, sourceName: "РЭУ им. Г. В. Плеханова", sourceSection: "40.03.01, Международное право и сравнительное правоведение", note: "Старый проходной балл 2022 года намеренно не используется для оценки 2026." }, tags: ["Право", "Международное право"]
}));

export const programs = programsBase;

export const formatPrice = (value: number | null) => value === null ? "не опубликовано" : `${new Intl.NumberFormat("ru-RU").format(value)} ₽/год`;
export const getUniversity = (slug: string) => universities.find((item) => item.slug === slug);
export const getProgram = (slug: string) => programs.find((item) => item.slug === slug);
