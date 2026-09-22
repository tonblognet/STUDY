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
  ],
});
