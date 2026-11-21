import { createUniversityAdapter } from "../../core/adapter";
import admissions from "../../release/2026-12/evidence/2026-11-21-fa-admissions.json";

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
    {
      category: "rules",
      url: admissions.sources["rules-2026"].sourceUrl,
      title: "Правила приёма, приказ № 0056/о",
      year: 2026,
      format: "pdf",
    },
    {
      category: "places",
      url: admissions.sources["places-2026"].sourceUrl,
      title: "Бюджетные и платные места, приказ № 0059/о",
      year: 2026,
      format: "pdf",
    },
    {
      category: "tuition",
      url: admissions.sources["tuition-2026"].sourceUrl,
      title: "Прейскурант для поступающих на первый курс в Москве",
      year: 2026,
      format: "pdf",
    },
  ],
});
