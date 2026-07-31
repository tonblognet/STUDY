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

export type Program = {
  id: string;
  slug: string;
  universitySlug: string;
  university: string;
  universityShort: string;
  code: string;
  title: string;
  level: "Бакалавриат" | "Специалитет" | "Магистратура";
  form: "Очная" | "Очно-заочная" | "Заочная";
  duration: string;
  subjects: string[];
  passingScore: number | null;
  previousScores: { year: number; score: number | null }[];
  minScore: number;
  budgetPlaces: number | null;
  paidPlaces: number | null;
  tuition: number | null;
  dvi: string | null;
  sourceUrl: string;
  updatedAt: string;
  verified: boolean;
  tags: string[];
};

export const universities: University[] = [
  { id: "msu", slug: "mgu", shortName: "МГУ", name: "Московский государственный университет имени М. В. Ломоносова", color: "#6b52e5", description: "Классический университет с фундаментальной подготовкой и собственными дополнительными вступительными испытаниями.", address: "Ленинские горы, 1", website: "https://www.msu.ru", programsCount: 58 },
  { id: "hse", slug: "hse", shortName: "ВШЭ", name: "Национальный исследовательский университет «Высшая школа экономики»", color: "#1677ff", description: "Исследовательский университет с сильными программами в экономике, технологиях, социальных науках и дизайне.", address: "ул. Мясницкая, 20", website: "https://www.hse.ru", programsCount: 92 },
  { id: "bmstu", slug: "bmstu", shortName: "МГТУ", name: "Московский государственный технический университет имени Н. Э. Баумана", color: "#15a37b", description: "Ведущий технический университет России: инженерия, ИТ, робототехника и фундаментальные науки.", address: "2-я Бауманская ул., 5", website: "https://bmstu.ru", programsCount: 74 },
  { id: "mipt", slug: "mipt", shortName: "МФТИ", name: "Московский физико-технический институт", color: "#ef6a3d", description: "Фундаментальная физико-математическая и технологическая подготовка с ранним включением в исследования.", address: "Институтский пер., 9", website: "https://mipt.ru", programsCount: 31 },
  { id: "ranepa", slug: "ranepa", shortName: "РАНХиГС", name: "Российская академия народного хозяйства и государственной службы", color: "#d24d8d", description: "Программы в области управления, экономики, права, общественных наук и государственного администрирования.", address: "проспект Вернадского, 82", website: "https://www.ranepa.ru", programsCount: 86 },
  { id: "mephi", slug: "mephi", shortName: "МИФИ", name: "Национальный исследовательский ядерный университет «МИФИ»", color: "#2865c7", description: "Ядерная физика, информационная безопасность, прикладная математика и высокие технологии.", address: "Каширское шоссе, 31", website: "https://mephi.ru", programsCount: 43 },
];

export const programs: Program[] = [
  { id: "hse-se", slug: "hse-software-engineering", universitySlug: "hse", university: universities[1].name, universityShort: "ВШЭ", code: "09.03.04", title: "Программная инженерия", level: "Бакалавриат", form: "Очная", duration: "4 года", subjects: ["Математика", "Русский язык", "Информатика"], passingScore: 304, previousScores: [{year: 2025, score: 304}, {year: 2024, score: 303}, {year: 2023, score: 301}], minScore: 180, budgetPlaces: 160, paidPlaces: 250, tuition: 720000, dvi: null, sourceUrl: "https://www.hse.ru/ba/se/", updatedAt: "28 июля 2026", verified: true, tags: ["ИТ", "Популярное"] },
  { id: "bmstu-cs", slug: "bmstu-computer-science", universitySlug: "bmstu", university: universities[2].name, universityShort: "МГТУ", code: "09.03.01", title: "Информатика и вычислительная техника", level: "Бакалавриат", form: "Очная", duration: "4 года", subjects: ["Математика", "Русский язык", "Информатика"], passingScore: 278, previousScores: [{year: 2025, score: 278}, {year: 2024, score: 276}, {year: 2023, score: 274}], minScore: 175, budgetPlaces: 196, paidPlaces: 120, tuition: 426000, dvi: null, sourceUrl: "https://bmstu.ru/bachelor", updatedAt: "25 июля 2026", verified: true, tags: ["ИТ", "Инженерия"] },
  { id: "msu-econ", slug: "mgu-economics", universitySlug: "mgu", university: universities[0].name, universityShort: "МГУ", code: "38.03.01", title: "Экономика", level: "Бакалавриат", form: "Очная", duration: "4 года", subjects: ["Математика", "Русский язык", "Обществознание"], passingScore: 367, previousScores: [{year: 2025, score: 367}, {year: 2024, score: 365}, {year: 2023, score: 359}], minScore: 190, budgetPlaces: 178, paidPlaces: 310, tuition: 690000, dvi: "Письменная математика", sourceUrl: "https://www.econ.msu.ru/entrance/bachelor/", updatedAt: "29 июля 2026", verified: true, tags: ["Экономика", "ДВИ"] },
  { id: "mipt-am", slug: "mipt-applied-math", universitySlug: "mipt", university: universities[3].name, universityShort: "МФТИ", code: "01.03.02", title: "Прикладная математика и информатика", level: "Бакалавриат", form: "Очная", duration: "4 года", subjects: ["Математика", "Русский язык", "Физика / Информатика"], passingScore: 295, previousScores: [{year: 2025, score: 295}, {year: 2024, score: 291}, {year: 2023, score: 289}], minScore: 185, budgetPlaces: 140, paidPlaces: 55, tuition: 467000, dvi: null, sourceUrl: "https://mipt.ru/education/departments/", updatedAt: "27 июля 2026", verified: true, tags: ["Математика", "ИТ"] },
  { id: "ranepa-law", slug: "ranepa-law", universitySlug: "ranepa", university: universities[4].name, universityShort: "РАНХиГС", code: "40.03.01", title: "Юриспруденция", level: "Бакалавриат", form: "Очная", duration: "4 года", subjects: ["Обществознание", "Русский язык", "История"], passingScore: 283, previousScores: [{year: 2025, score: 283}, {year: 2024, score: 280}, {year: 2023, score: 277}], minScore: 170, budgetPlaces: 35, paidPlaces: 420, tuition: 490000, dvi: null, sourceUrl: "https://www.ranepa.ru/bakalavriat/", updatedAt: "23 июля 2026", verified: true, tags: ["Право"] },
  { id: "mephi-security", slug: "mephi-information-security", universitySlug: "mephi", university: universities[5].name, universityShort: "МИФИ", code: "10.05.01", title: "Компьютерная безопасность", level: "Специалитет", form: "Очная", duration: "5 лет 6 месяцев", subjects: ["Математика", "Русский язык", "Информатика"], passingScore: 291, previousScores: [{year: 2025, score: 291}, {year: 2024, score: 287}, {year: 2023, score: 285}], minScore: 180, budgetPlaces: 110, paidPlaces: 45, tuition: 430000, dvi: null, sourceUrl: "https://admission.mephi.ru/admission/baccalaureate-and-specialty/", updatedAt: "26 июля 2026", verified: true, tags: ["ИТ", "Безопасность"] },
  { id: "hse-design", slug: "hse-design", universitySlug: "hse", university: universities[1].name, universityShort: "ВШЭ", code: "54.03.01", title: "Дизайн", level: "Бакалавриат", form: "Очная", duration: "4 года", subjects: ["Русский язык", "Литература"], passingScore: null, previousScores: [{year: 2025, score: null}, {year: 2024, score: null}], minScore: 120, budgetPlaces: 45, paidPlaces: 300, tuition: 890000, dvi: "Творческий конкурс и портфолио", sourceUrl: "https://design.hse.ru/ba/design", updatedAt: "22 июля 2026", verified: true, tags: ["Дизайн", "ДВИ"] },
  { id: "msu-journalism", slug: "mgu-journalism", universitySlug: "mgu", university: universities[0].name, universityShort: "МГУ", code: "42.03.02", title: "Журналистика", level: "Бакалавриат", form: "Очно-заочная", duration: "4 года 6 месяцев", subjects: ["Русский язык", "Литература"], passingScore: 353, previousScores: [{year: 2025, score: 353}, {year: 2024, score: 350}, {year: 2023, score: 346}], minScore: 130, budgetPlaces: 80, paidPlaces: 210, tuition: null, dvi: "Творческое испытание", sourceUrl: "https://www.journ.msu.ru/entrance/", updatedAt: "18 июля 2026", verified: false, tags: ["Медиа", "ДВИ"] },
];

export const formatPrice = (value: number | null) => value === null ? "уточняется" : `${new Intl.NumberFormat("ru-RU").format(value)} ₽/год`;
export const getUniversity = (slug: string) => universities.find((item) => item.slug === slug);
export const getProgram = (slug: string) => programs.find((item) => item.slug === slug);
