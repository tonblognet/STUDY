import { createUniversityAdapter } from "../../core/adapter";

export default createUniversityAdapter({
  slug: "muctr",
  name: "РХТУ им. Д. И. Менделеева",
  officialDomains: ["muctr.ru"],
  markers: ["18.03.01", "19.03.01", "04.05.01"],
  sources: [
    {
      category: "programs",
      url: "https://chemeng2030.muctr.ru/",
      title: "Поступление в РХТУ в 2026 году",
      year: 2026,
      format: "html",
      locator: "Образовательные программы",
    },
  ],
});
