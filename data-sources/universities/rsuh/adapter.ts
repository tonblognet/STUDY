import { createUniversityAdapter } from "../../core/adapter";

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
  ],
});
