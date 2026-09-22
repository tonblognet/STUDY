import { createUniversityAdapter } from "../../core/adapter";

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
  ],
});
