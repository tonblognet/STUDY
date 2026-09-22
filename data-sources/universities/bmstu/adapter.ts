import { createUniversityAdapter } from "../../core/adapter";

export default createUniversityAdapter({
  slug: "bmstu",
  name: "МГТУ им. Н. Э. Баумана",
  officialDomains: ["bmstu.ru"],
  markers: ["09.03.01", "15.03.06", "24.05.06"],
  sources: [
    {
      category: "programs",
      url: "https://priem.bmstu.ru",
      title: "Кабинет абитуриента МГТУ им. Н. Э. Баумана",
      year: 2026,
      format: "html",
      locator: "Перечень направлений бакалавриата и специалитета",
    },
  ],
});
