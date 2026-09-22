import {
  createUniversityAdapter,
  type OfficialSource,
} from "../../core/adapter";
import details from "./program-details-2026.json";

const facultySources = new Map<string, OfficialSource>();
for (const program of details.programs) {
  for (const [kind, fact] of [
    ["tuition", program.tuition],
    ["programs", program.duration],
  ] as const) {
    if (!fact) continue;
    const key = `${kind}:${fact.sourceUrl}`;
    if (!facultySources.has(key))
      facultySources.set(key, {
        category: kind,
        url: fact.sourceUrl,
        title: `${program.faculty}: ${kind === "tuition" ? "стоимость" : "срок обучения"}`,
        year: 2026,
        format: fact.sourceUrl.endsWith(".pdf") ? "pdf" : "html",
        locator: fact.sourceSection,
      });
  }
}
export default createUniversityAdapter({
  slug: "mgu",
  name: "МГУ",
  // Faculty sites linked by the Central Admissions Committee at cpk.msu.ru/pk.
  officialDomains: [
    "msu.ru",
    "psy-msu.ru",
    "anspa.ru",
    "artsmsu.ru",
    "mgubs.ru",
    "mse-msu.ru",
  ],
  markers: ["МГУ", "вступительные испытания", "проходной балл"],
  sources: [
    ...facultySources.values(),
    {
      category: "exams",
      url: "https://cpk.msu.ru/files/2026/minimum.pdf",
      title: "Минимумы ЕГЭ и ДВИ, включая исключения факультетов",
      year: 2026,
      format: "pdf",
      locator: "Пункты 1.1–1.12",
    },
    {
      category: "rules",
      url: "https://cpk.msu.ru/files/2026/rules.pdf",
      title: "Правила приёма МГУ 2026",
      year: 2026,
      format: "pdf",
      locator: "Пункты 11, 14, 28: шкала, общежитие, индивидуальные достижения",
    },
    {
      category: "facts",
      url: "https://cpk.msu.ru/pk",
      title: "Контакты приёмных комиссий факультетов",
      year: 2026,
      format: "html",
      locator: "39 факультетов и школ каталога",
    },
    {
      category: "programs",
      url: "https://cpk.msu.ru/files/2026/kcp_bak.pdf",
      title: "Направления, места и испытания бакалавриата и специалитета",
      year: 2026,
      format: "pdf",
      locator: "Страницы 1–28, московские факультеты",
    },
    {
      category: "results",
      url: "https://cpk.msu.ru/legal",
      title: "Официальный архив проходных баллов МГУ",
      year: 2025,
      format: "html",
      locator: "Проходные баллы за 2011–2025 годы",
    },
    {
      category: "facts",
      url: "https://international.msu.ru/ru",
      title: "Официальный адрес МГУ",
      year: 2026,
      format: "html",
      locator: "Контакты",
    },
    {
      category: "facts",
      url: "https://spa.msu.ru/students/voennaya-podgotovka/",
      title: "Военный учебный центр МГУ",
      year: 2026,
      format: "html",
      locator: "Военная подготовка — ссылка на ВУЦ и конкурсный отбор",
    },
    {
      category: "campuses",
      url: "https://osk.msu.ru/d/1/faq/",
      title: "Дом студента в Главном здании МГУ",
      year: 2026,
      format: "html",
      locator: "Главное здание МГУ включает в себя",
    },
  ],
});
