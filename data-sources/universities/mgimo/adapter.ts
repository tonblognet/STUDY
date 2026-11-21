import { createUniversityAdapter } from "../../core/adapter";
import admissions from "../../release/2026-12/evidence/2026-11-21-mgimo-admissions.json";

export default createUniversityAdapter({
  slug: "mgimo",
  name: "МГИМО МИД России",
  officialDomains: ["mgimo.ru"],
  markers: ["41.03.05", "40.03.01", "38.03.01"],
  sources: [
    {
      category: "programs",
      url: "https://mgimo.ru/study/admission/",
      title: "Поступление в МГИМО",
      year: 2026,
      format: "html",
      locator: "Бакалавриат и специалитет",
    },
    {
      category: "rules",
      url: admissions.sources["rules-2026"].sourceUrl,
      title: "Правила приёма МГИМО 2026 года",
      year: 2026,
      format: "pdf",
    },
    {
      category: "exams",
      url: admissions.sources["rules-2026"].sourceUrl,
      title: "Вступительные испытания и минимальные баллы",
      year: 2026,
      format: "pdf",
      locator: "Раздел 2.2 и приложение 1",
    },
    {
      category: "places",
      url: admissions.sources["places-index-2026"].sourceUrl,
      title: "Планы мест приёмной кампании 2026 года",
      year: 2026,
      format: "html",
    },
    {
      category: "tuition",
      url: admissions.sources["fees-2026"].sourceUrl,
      title: "Стоимость бакалавриата для набора 2026/2027",
      year: 2026,
      format: "html",
    },
  ],
});
