export type ExpandedUniversitySeed = {
  id: string;
  slug: string;
  shortName: string;
  name: string;
  color: string;
  description: string;
  city: string;
  address: string;
  website: string;
  programsCount: number;
  logoUrl?: string;
  logoSourceUrl: string;
  militaryCenter: boolean | null;
  militaryCenterSourceUrl?: string;
  admissionsUrl: string;
  admissionsPhone?: string;
  admissionsEmail?: string;
  foundedYear?: number;
  dormitoriesCount?: number;
  faculties: string[];
  factsSourceUrl: string;
};

export type ExpandedProgramSeed = {
  id: string;
  universitySlug: string;
  code: string;
  title: string;
  level?: "Бакалавриат" | "Специалитет";
  duration?: string;
  form?: "Очная" | "Очно-заочная" | "Заочная";
  faculty?: string;
  subjects?: string[];
  sourceUrl: string;
  sourceName: string;
  tags: string[];
};

export const expandedUniversities: ExpandedUniversitySeed[] = [
  {
    id: "bmstu",
    slug: "bmstu",
    shortName: "МГТУ",
    name: "Московский государственный технический университет имени Н. Э. Баумана",
    color: "#214d8c",
    description:
      "Инженерный университет с программами в ИТ, робототехнике, приборостроении, энергетике и аэрокосмических технологиях.",
    city: "Москва",
    address: "Москва, 2-я Бауманская улица, 5",
    website: "https://bmstu.ru",
    programsCount: 8,
    logoUrl: "https://bmstu.ru/favicon.ico",
    logoSourceUrl: "https://bmstu.ru",
    militaryCenter: true,
    militaryCenterSourceUrl: "https://mil.bmstu.ru",
    admissionsUrl: "https://priem.bmstu.ru",
    foundedYear: 1830,
    faculties: ["Информатика", "Робототехника", "Энергомашиностроение"],
    factsSourceUrl: "https://bmstu.ru/about",
  },
  {
    id: "mgimo",
    slug: "mgimo",
    shortName: "МГИМО",
    name: "Московский государственный институт международных отношений МИД России",
    color: "#173f74",
    description:
      "Университет международных отношений, права, экономики, управления, журналистики и зарубежного регионоведения.",
    city: "Москва",
    address: "Москва, проспект Вернадского, 76",
    website: "https://mgimo.ru",
    programsCount: 8,
    logoUrl: "https://mgimo.ru/favicon.ico",
    logoSourceUrl: "https://mgimo.ru",
    militaryCenter: true,
    militaryCenterSourceUrl:
      "https://mgimo.ru/about/structure/faculties/military/",
    admissionsUrl: "https://mgimo.ru/study/admission/",
    foundedYear: 1944,
    faculties: [
      "Международные отношения",
      "Международное право",
      "Международный бизнес",
    ],
    factsSourceUrl: "https://mgimo.ru/about/",
  },
  {
    id: "pirogov",
    slug: "pirogov",
    shortName: "РНИМУ",
    name: "Российский национальный исследовательский медицинский университет имени Н. И. Пирогова",
    color: "#086f60",
    description:
      "Медицинский исследовательский университет: лечебное дело, педиатрия, стоматология, фармация и медико-биологические направления.",
    city: "Москва",
    address: "Москва, улица Островитянова, 1",
    website: "https://rsmu.ru",
    programsCount: 8,
    logoUrl: "https://rsmu.ru/favicon.ico",
    logoSourceUrl: "https://rsmu.ru",
    militaryCenter: true,
    militaryCenterSourceUrl: "https://rsmu.ru/structure/edu-dept/vuc",
    admissionsUrl: "https://rsmu.ru/abitur/bachelor",
    foundedYear: 1906,
    faculties: ["Лечебный", "Педиатрический", "Медико-биологический"],
    factsSourceUrl: "https://rsmu.ru/about",
  },
  {
    id: "sechenov",
    slug: "sechenov",
    shortName: "Сеченовский",
    name: "Первый Московский государственный медицинский университет имени И. М. Сеченова",
    color: "#008f91",
    description:
      "Медицинский университет с программами клинического, фармацевтического, биотехнологического и цифрового профиля.",
    city: "Москва",
    address: "Москва, Большая Пироговская улица, 2с4",
    website: "https://www.sechenov.ru",
    programsCount: 8,
    logoUrl: "https://www.sechenov.ru/favicon.ico",
    logoSourceUrl: "https://www.sechenov.ru",
    militaryCenter: true,
    militaryCenterSourceUrl:
      "https://www.sechenov.ru/univers/structure/institute/vuc/",
    admissionsUrl:
      "https://www.sechenov.ru/admissions/priemnaya-kampaniya-2026/bakalavriat-spetsialitet/",
    foundedYear: 1758,
    faculties: ["Клиническая медицина", "Фармация", "Биотехнология"],
    factsSourceUrl: "https://www.sechenov.ru/univers/about/",
  },
  {
    id: "gubkin",
    slug: "gubkin",
    shortName: "РГУ нефти и газа",
    name: "Российский государственный университет нефти и газа имени И. М. Губкина",
    color: "#164e8f",
    description:
      "Профильный университет полного нефтегазового цикла с инженерными, ИТ, химическими и экономическими программами.",
    city: "Москва",
    address: "Москва, Ленинский проспект, 65к1",
    website: "https://www.gubkin.ru",
    programsCount: 8,
    logoUrl:
      "https://static.tildacdn.com/tild3664-6338-4565-b038-646561383339/__13.svg",
    logoSourceUrl: "https://postupai.gubkin.ru/",
    militaryCenter: true,
    militaryCenterSourceUrl: "https://postupai.gubkin.ru/",
    admissionsUrl: "https://postupai.gubkin.ru/",
    admissionsPhone: "+7 (499) 507-84-06",
    admissionsEmail: "priem@gubkin.ru",
    foundedYear: 1930,
    dormitoriesCount: 5,
    faculties: [
      "Геология и геофизика",
      "Разработка нефтяных и газовых месторождений",
      "Химическая технология",
    ],
    factsSourceUrl: "https://postupai.gubkin.ru/",
  },
  {
    id: "msal",
    slug: "msal",
    shortName: "МГЮА",
    name: "Московский государственный юридический университет имени О. Е. Кутафина",
    color: "#7a1735",
    description:
      "Профильный юридический университет с бакалавриатом и специалитетом в сфере права, безопасности и судебной экспертизы.",
    city: "Москва",
    address: "Москва, Садовая-Кудринская улица, 9",
    website: "https://msal.ru",
    programsCount: 4,
    logoUrl: "https://msal.ru/favicon.ico",
    logoSourceUrl: "https://msal.ru",
    militaryCenter: null,
    admissionsUrl:
      "https://msal.ru/content/abiturientam/priemnaya-kampaniya/bakalavriat-spetsialitet/",
    foundedYear: 1931,
    faculties: ["Право", "Национальная безопасность", "Судебная экспертиза"],
    factsSourceUrl: "https://msal.ru/content/ob-universitete/",
  },
  {
    id: "muctr",
    slug: "muctr",
    shortName: "РХТУ",
    name: "Российский химико-технологический университет имени Д. И. Менделеева",
    color: "#126e77",
    description:
      "Университет химической технологии, материаловедения, промышленной биотехнологии, автоматизации и инженерии.",
    city: "Москва",
    address: "Москва, Миусская площадь, 9",
    website: "https://www.muctr.ru",
    programsCount: 8,
    logoUrl: "https://www.muctr.ru/favicon.ico",
    logoSourceUrl: "https://www.muctr.ru",
    militaryCenter: null,
    admissionsUrl: "https://www.muctr.ru/entrant/",
    foundedYear: 1898,
    faculties: [
      "Химическая технология",
      "Биотехнология",
      "Цифровые технологии",
    ],
    factsSourceUrl: "https://www.muctr.ru/university/",
  },
  {
    id: "rsuh",
    slug: "rsuh",
    shortName: "РГГУ",
    name: "Российский государственный гуманитарный университет",
    color: "#673b78",
    description:
      "Многопрофильный гуманитарный университет: история, архивоведение, лингвистика, международные отношения, управление и ИТ.",
    city: "Москва",
    address: "Москва, Миусская площадь, 6",
    website: "https://www.rsuh.ru",
    programsCount: 8,
    logoUrl: "https://www.rsuh.ru/favicon.ico",
    logoSourceUrl: "https://www.rsuh.ru",
    militaryCenter: null,
    admissionsUrl: "https://rsuh.ru/abitur/",
    foundedYear: 1991,
    faculties: ["История", "Архивоведение", "Международные отношения"],
    factsSourceUrl: "https://www.rsuh.ru/who_is_who/",
  },
  {
    id: "fa",
    slug: "fa",
    shortName: "Финуниверситет",
    name: "Финансовый университет при Правительстве Российской Федерации",
    color: "#1355a2",
    description:
      "Университет финансов, экономики, управления, бизнес-информатики, информационной безопасности и права.",
    city: "Москва",
    address: "Москва, Ленинградский проспект, 49/2",
    website: "https://www.fa.ru",
    programsCount: 10,
    logoUrl: "https://www.fa.ru/favicon.ico",
    logoSourceUrl: "https://www.fa.ru",
    militaryCenter: true,
    militaryCenterSourceUrl: "https://www.fa.ru/university/structure/vuc/",
    admissionsUrl: "https://www.fa.ru/for-applicants/abitur2026/bak/",
    foundedYear: 1919,
    faculties: ["Финансы", "Экономика", "ИТ и анализ больших данных"],
    factsSourceUrl: "https://www.fa.ru/university/about/",
  },
  {
    id: "mospolytech",
    slug: "mospolytech",
    shortName: "Московский Политех",
    name: "Московский политехнический университет",
    color: "#2353d1",
    description:
      "Практико-ориентированный университет инженерии, транспорта, ИТ, дизайна, издательского дела и креативных индустрий.",
    city: "Москва",
    address: "Москва, Большая Семёновская улица, 38",
    website: "https://mospolytech.ru",
    programsCount: 10,
    logoUrl: "https://mospolytech.ru/favicon.ico",
    logoSourceUrl: "https://mospolytech.ru",
    militaryCenter: true,
    militaryCenterSourceUrl:
      "https://mospolytech.ru/obuchauschimsya/voennyy-uchebnyy-tsentr/",
    admissionsUrl: "https://mospolytech.ru/postupayushchim/",
    foundedYear: 1865,
    faculties: ["Информационные технологии", "Транспорт", "Дизайн"],
    factsSourceUrl: "https://mospolytech.ru/university/about/",
  },
];

const source = {
  bmstu: "https://priem.bmstu.ru",
  mgimo: "https://mgimo.ru/study/admission/",
  pirogov: "https://rsmu.ru/abitur/bachelor",
  sechenov:
    "https://www.sechenov.ru/admissions/priemnaya-kampaniya-2026/bakalavriat-spetsialitet/",
  gubkin: "https://postupai.gubkin.ru/",
  msal: "https://msal.ru/content/abiturientam/priemnaya-kampaniya/bakalavriat-spetsialitet/",
  muctr: "https://chemeng2030.muctr.ru/",
  rsuh: "https://www.rsuh.ru/sveden/education/index_.php",
  fa: "https://www.fa.ru/for-applicants/abitur2026/bak/",
  mospolytech:
    "https://mospolytech.ru/upload/iblock/191/ykedf9chhmhzr36p3ip9uiqca21sebgi/4.1_Moskva.pdf",
} as const;

const titles: Record<keyof typeof source, Array<[string, string, string[]]>> = {
  bmstu: [
    ["09.03.01", "Информатика и вычислительная техника", ["ИТ", "Инженерия"]],
    ["09.03.03", "Прикладная информатика", ["ИТ", "Данные"]],
    ["09.03.04", "Программная инженерия", ["ИТ", "Разработка"]],
    ["12.03.01", "Приборостроение", ["Инженерия", "Приборы"]],
    ["15.03.06", "Мехатроника и робототехника", ["Робототехника", "Инженерия"]],
    ["13.03.03", "Энергетическое машиностроение", ["Энергетика", "Инженерия"]],
    [
      "24.05.06",
      "Системы управления летательными аппаратами",
      ["Авиация", "Инженерия"],
    ],
    [
      "27.03.04",
      "Управление в технических системах",
      ["Автоматизация", "Инженерия"],
    ],
  ],
  mgimo: [
    ["41.03.05", "Международные отношения", ["Международные отношения"]],
    ["41.03.01", "Зарубежное регионоведение", ["Регионы", "Языки"]],
    ["40.03.01", "Юриспруденция", ["Право"]],
    ["38.03.01", "Экономика", ["Экономика"]],
    ["38.03.02", "Менеджмент", ["Управление"]],
    ["42.03.02", "Журналистика", ["Медиа", "Творчество"]],
    [
      "42.03.01",
      "Реклама и связи с общественностью",
      ["Медиа", "Коммуникации"],
    ],
    ["45.03.02", "Лингвистика", ["Языки"]],
  ],
  pirogov: [
    ["31.05.01", "Лечебное дело", ["Медицина"]],
    ["31.05.02", "Педиатрия", ["Медицина", "Дети"]],
    ["31.05.03", "Стоматология", ["Медицина"]],
    ["33.05.01", "Фармация", ["Медицина", "Фармация"]],
    ["30.05.01", "Медицинская биохимия", ["Медицина", "Биохимия"]],
    ["30.05.02", "Медицинская биофизика", ["Медицина", "Физика"]],
    ["30.05.03", "Медицинская кибернетика", ["Медицина", "ИТ"]],
    ["37.05.01", "Клиническая психология", ["Психология", "Медицина"]],
  ],
  sechenov: [
    ["31.05.01", "Лечебное дело", ["Медицина"]],
    ["31.05.03", "Стоматология", ["Медицина"]],
    ["33.05.01", "Фармация", ["Фармация"]],
    ["30.05.01", "Медицинская биохимия", ["Биохимия", "Медицина"]],
    ["34.03.01", "Сестринское дело", ["Медицина"]],
    ["19.03.01", "Биотехнология", ["Биотехнология"]],
    ["06.03.01", "Биология", ["Биология"]],
    ["09.03.02", "Информационные системы и технологии", ["ИТ", "Медицина"]],
  ],
  gubkin: [
    ["21.03.01", "Нефтегазовое дело", ["Нефть и газ", "Инженерия"]],
    ["21.05.02", "Прикладная геология", ["Геология", "Нефть и газ"]],
    ["18.03.01", "Химическая технология", ["Химия", "Нефть и газ"]],
    ["15.03.02", "Технологические машины и оборудование", ["Инженерия"]],
    ["13.03.02", "Электроэнергетика и электротехника", ["Энергетика"]],
    ["09.03.01", "Информатика и вычислительная техника", ["ИТ"]],
    ["38.03.01", "Экономика", ["Экономика", "Нефть и газ"]],
    ["38.03.02", "Менеджмент", ["Управление", "Нефть и газ"]],
  ],
  msal: [
    ["40.03.01", "Юриспруденция", ["Право"]],
    [
      "40.05.01",
      "Правовое обеспечение национальной безопасности",
      ["Право", "Безопасность"],
    ],
    ["40.05.03", "Судебная экспертиза", ["Право", "Экспертиза"]],
    ["40.05.04", "Судебная и прокурорская деятельность", ["Право", "Суд"]],
  ],
  muctr: [
    ["18.03.01", "Химическая технология", ["Химия", "Инженерия"]],
    ["19.03.01", "Биотехнология", ["Биотехнология"]],
    ["15.03.02", "Технологические машины и оборудование", ["Инженерия"]],
    ["27.03.04", "Управление в технических системах", ["Автоматизация"]],
    ["09.03.04", "Программная инженерия", ["ИТ"]],
    ["28.03.02", "Наноинженерия", ["Нанотехнологии"]],
    ["28.03.03", "Наноматериалы", ["Материалы"]],
    ["04.05.01", "Фундаментальная и прикладная химия", ["Химия", "Наука"]],
  ],
  rsuh: [
    ["46.03.01", "История", ["История"]],
    ["46.03.02", "Документоведение и архивоведение", ["Архивы", "История"]],
    ["45.03.02", "Лингвистика", ["Языки"]],
    ["41.03.05", "Международные отношения", ["Международные отношения"]],
    ["41.03.01", "Зарубежное регионоведение", ["Регионы"]],
    ["38.03.02", "Менеджмент", ["Управление"]],
    ["40.03.01", "Юриспруденция", ["Право"]],
    [
      "45.03.04",
      "Интеллектуальные системы в гуманитарной сфере",
      ["ИТ", "Гуманитарные науки"],
    ],
  ],
  fa: [
    ["38.03.01", "Экономика", ["Экономика", "Финансы"]],
    ["38.03.02", "Менеджмент", ["Управление"]],
    ["38.03.05", "Бизнес-информатика", ["ИТ", "Бизнес"]],
    [
      "38.03.04",
      "Государственное и муниципальное управление",
      ["Государство", "Управление"],
    ],
    ["09.03.03", "Прикладная информатика", ["ИТ"]],
    ["10.03.01", "Информационная безопасность", ["ИТ", "Безопасность"]],
    ["40.03.01", "Юриспруденция", ["Право"]],
    ["42.03.01", "Реклама и связи с общественностью", ["Коммуникации"]],
    ["43.03.02", "Туризм", ["Туризм"]],
    ["27.03.05", "Инноватика", ["Инновации", "Управление"]],
  ],
  mospolytech: [
    ["09.03.01", "Информатика и вычислительная техника", ["ИТ"]],
    ["09.03.03", "Прикладная информатика", ["ИТ"]],
    ["09.03.04", "Программная инженерия", ["ИТ"]],
    [
      "23.03.03",
      "Эксплуатация транспортно-технологических машин и комплексов",
      ["Транспорт"],
    ],
    [
      "15.03.05",
      "Конструкторско-технологическое обеспечение машиностроительных производств",
      ["Инженерия"],
    ],
    [
      "29.03.03",
      "Технология полиграфического и упаковочного производства",
      ["Полиграфия"],
    ],
    ["42.03.03", "Издательское дело", ["Медиа"]],
    ["54.03.01", "Дизайн", ["Дизайн", "Творчество"]],
    ["27.03.05", "Инноватика", ["Инновации"]],
    ["13.03.02", "Электроэнергетика и электротехника", ["Энергетика"]],
  ],
};

const specialistCodes = new Set([
  "24.05.06",
  "31.05.01",
  "31.05.02",
  "31.05.03",
  "33.05.01",
  "30.05.01",
  "30.05.02",
  "30.05.03",
  "37.05.01",
  "40.05.01",
  "40.05.03",
  "40.05.04",
  "21.05.02",
  "04.05.01",
]);

export const expandedPrograms: ExpandedProgramSeed[] = Object.entries(
  titles,
).flatMap(([universitySlug, items]) =>
  items.map(([code, title, tags], index) => ({
    id: `${universitySlug}-${code.replaceAll(".", "-")}-${index + 1}`,
    universitySlug,
    code,
    title,
    level: specialistCodes.has(code) ? "Специалитет" : "Бакалавриат",
    duration: specialistCodes.has(code) ? "5–6 лет" : "4 года",
    sourceUrl: source[universitySlug as keyof typeof source],
    sourceName:
      expandedUniversities.find((item) => item.slug === universitySlug)
        ?.shortName ?? universitySlug,
    tags: [...tags, "Официальный перечень"],
  })),
);
