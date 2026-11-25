import { createUniversityAdapter } from "../../core/adapter";
import evidence from "../../release/2026-12/evidence/2026-11-21-rsuh-admissions.json";

export default createUniversityAdapter({
  slug: "rsuh",
  name: "РГГУ",
  officialDomains: ["rsuh.ru"],
  markers: ["46.03.01", "46.03.02", "45.03.02"],
  sources: [
    {
      category: "programs",
      url: "https://www.rsuh.ru/sveden/education/index_.php",
      title: "Информация о реализуемых образовательных программах",
      year: 2026,
      format: "html",
      locator: "Высшее образование — бакалавриат и специалитет",
    },
    {
      category: "rules",
      url: evidence.sources["rules26.pdf"].sourceUrl,
      title: "Правила приёма 2026 года в редакции от 15 мая",
      year: 2026,
      format: "pdf",
    },
    {
      category: "exams",
      url: evidence.sources["exams26.pdf"].sourceUrl,
      title: "Вступительные испытания и минимальные баллы",
      year: 2026,
      format: "pdf",
    },
    {
      category: "places",
      url: evidence.sources["places26.pdf"].sourceUrl,
      title: "План приёма и квоты по формам обучения",
      year: 2026,
      format: "pdf",
    },
    {
      category: "tuition",
      url: evidence.sources["tuition-bac26.pdf"].sourceUrl,
      title: "Стоимость семестра для поступающих на первый курс",
      year: 2026,
      format: "pdf",
    },
    {
      category: "results",
      url: evidence.sources["scores25.pdf"].sourceUrl,
      title: "Проходные баллы на бюджет и договор за 2025 год",
      year: 2025,
      format: "pdf",
    },
  ],
});
