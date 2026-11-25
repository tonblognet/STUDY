import { createUniversityAdapter } from "../../core/adapter";
import admissions from "../../release/2026-12/evidence/2026-11-21-mospolytech-admissions.json";

export default createUniversityAdapter({
  slug: "mospolytech",
  name: "Московский Политех",
  officialDomains: ["mospolytech.ru"],
  markers: ["09.03.01", "23.03.03", "54.03.01"],
  sources: [
    {
      category: "programs",
      url: "https://mospolytech.ru/upload/iblock/191/ykedf9chhmhzr36p3ip9uiqca21sebgi/4.1_Moskva.pdf",
      title: "Перечень образовательных программ, Москва",
      year: 2026,
      format: "pdf",
      locator: "Таблица 4.1, направления и специальности",
    },
    {
      category: "rules",
      url: admissions.sources["rules-2026"].sourceUrl,
      title: "Правила приёма в Московский Политех",
      year: 2026,
      format: "pdf",
    },
    {
      category: "places",
      url: admissions.sources["places-2026"].sourceUrl,
      title: "План мест по конкурсным группам Москвы",
      year: 2026,
      format: "pdf",
    },
    {
      category: "exams",
      url: admissions.sources["exams-2026"].sourceUrl,
      title: "Испытания и минимальные баллы для Москвы",
      year: 2026,
      format: "pdf",
    },
    {
      category: "results",
      url: admissions.sources["final-report-2026"].sourceUrl,
      title: "Итоги приёма 2026 года, Москва",
      year: 2026,
      format: "pdf",
    },
  ],
});
