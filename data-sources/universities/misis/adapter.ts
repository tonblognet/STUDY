import { createUniversityAdapter } from "../../core/adapter";
export default createUniversityAdapter({
  slug: "misis",
  name: "НИТУ МИСИС",
  officialDomains: ["misis.ru"],
  markers: ["Системный анализ", "440 000"],
  sources: [
    {
      category: "programs",
      url: "https://misis.ru/applicants/admission/baccalaureate-and-specialty/faculties/analysis/",
      title: "Системный анализ и управление",
      year: 2026,
      format: "html",
      locator: "места, минимальные баллы, стоимость",
    },
    {
      category: "rules",
      url: "https://misis.ru/applicants/admission/baccalaureate-and-specialty/",
      title: "Бакалавриат и специалитет",
      year: 2026,
      format: "html",
    },
  ],
});
