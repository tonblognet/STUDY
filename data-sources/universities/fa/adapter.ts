import { createUniversityAdapter } from "../../core/adapter";

export default createUniversityAdapter({
  slug: "fa",
  name: "Финансовый университет",
  officialDomains: ["fa.ru"],
  markers: ["38.03.01", "38.03.05", "10.03.01"],
  sources: [
    {
      category: "programs",
      url: "https://www.fa.ru/for-applicants/abitur2026/bak/",
      title: "Бакалавриат и специалитет: приём 2026",
      year: 2026,
      format: "html",
      locator: "Образовательные программы",
    },
  ],
});
