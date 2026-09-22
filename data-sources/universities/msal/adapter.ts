import { createUniversityAdapter } from "../../core/adapter";

export default createUniversityAdapter({
  slug: "msal",
  name: "МГЮА имени О. Е. Кутафина",
  officialDomains: ["msal.ru"],
  markers: ["40.03.01", "40.05.01", "40.05.03"],
  sources: [
    {
      category: "programs",
      url: "https://msal.ru/content/abiturientam/priemnaya-kampaniya/bakalavriat-spetsialitet/",
      title: "Приёмная кампания: бакалавриат и специалитет",
      year: 2026,
      format: "html",
      locator: "Направления подготовки и специальности",
    },
  ],
});
