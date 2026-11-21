import { createUniversityAdapter } from "../../core/adapter";
import evidence from "../../release/2026-12/evidence/2026-11-21-pirogov-admissions.json";

export default createUniversityAdapter({
  slug: "pirogov",
  name: "Пироговский Университет",
  officialDomains: ["rsmu.ru"],
  markers: ["31.05.01", "31.05.02", "33.05.01"],
  sources: [
    {
      category: "programs",
      url: "https://rsmu.ru/abitur/bachelor",
      title: "Приёмная кампания 2026: специалитет",
      year: 2026,
      format: "html",
      locator:
        "Программы специалитета, базового высшего образования и бакалавриата",
    },
    {
      category: "rules",
      url: evidence.sources["rules-2026"].sourceUrl,
      title: "Правила приёма в 2026 году",
      year: 2026,
      format: "pdf",
    },
    {
      category: "exams",
      url: evidence.sources["exams-2026"].sourceUrl,
      title: "Вступительные испытания и минимальные баллы",
      year: 2026,
      format: "pdf",
    },
    {
      category: "places",
      url: evidence.sources["places-2026"].sourceUrl,
      title: "Контрольные цифры, квоты и места по договорам",
      year: 2026,
      format: "pdf",
    },
    {
      category: "tuition",
      url: evidence.sources["tuition-rf-2026"].sourceUrl,
      title: "Стоимость обучения по новым договорам в 2026/2027",
      year: 2026,
      format: "pdf",
    },
    {
      category: "results",
      url: evidence.sources["results-2026"].sourceUrl,
      title: "Итоговые результаты общего конкурса 2026 года",
      year: 2026,
      format: "pdf",
    },
  ],
});
