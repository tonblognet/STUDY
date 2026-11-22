import { createUniversityAdapter } from "../../core/adapter";

export default createUniversityAdapter({
  slug: "sechenov",
  name: "Сеченовский Университет",
  officialDomains: ["sechenov.ru"],
  markers: ["31.05.01", "31.05.03", "33.05.01"],
  sources: [
    {
      category: "programs",
      url: "https://www.sechenov.ru/admissions/priemnaya-kampaniya-2026/bakalavriat-spetsialitet/",
      title: "Приёмная кампания 2026: бакалавриат и специалитет",
      year: 2026,
      format: "html",
      locator: "Образовательные программы",
    },
    {
      category: "rules",
      url: "https://priem.sechenov.ru/undergraduate/pravila-priema/",
      title: "Правила и приложения к приёму в 2026 году",
      year: 2026,
      format: "html",
    },
    {
      category: "exams",
      url: "https://priem.sechenov.ru/undergraduate/informatsiya-o-vstupitelnykh-ispytaniyakh/",
      title: "Вступительные испытания бакалавриата и специалитета",
      year: 2026,
      format: "html",
    },
    {
      category: "places",
      url: "https://priem.sechenov.ru/undergraduate/",
      title: "Места и квоты по профилям 2026 года",
      year: 2026,
      format: "html",
      locator: "Образовательные программы",
    },
    {
      category: "tuition",
      url: "https://priem.sechenov.ru/undergraduate/",
      title: "Стоимость по годам обучения и гражданству",
      year: 2026,
      format: "html",
      locator: "Стоимость первого года обучения",
    },
    {
      category: "results",
      url: "https://priem.sechenov.ru/undergraduate/prokhodnye-bally-za-2025-god/",
      title: "Минимальные конкурсные баллы 2025 года",
      year: 2025,
      format: "html",
      locator: "Минимальная сумма конкурсных баллов за 2025 год",
    },
    {
      category: "results",
      url: "https://priem.sechenov.ru/enrollment-orders/",
      title: "Сведения о зачислении в 2026 году",
      year: 2026,
      format: "html",
      locator: "Бакалавриат/специалитет",
    },
  ],
});
