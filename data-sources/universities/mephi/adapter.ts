import { createUniversityAdapter } from "../../core/adapter";
export default createUniversityAdapter({
  slug: "mephi",
  name: "НИЯУ МИФИ",
  officialDomains: ["mephi.ru"],
  markers: ["14.03.02", "300 000"],
  sources: [
    {
      category: "tuition",
      url: "https://admission.mephi.ru/admission/baccalaureate-and-specialty/education/paid-formation",
      title: "Платное обучение",
      year: 2026,
      format: "html",
      locator: "14.03.02",
    },
    {
      category: "programs",
      url: "https://admission.mephi.ru/admission/baccalaureate-and-specialty",
      title: "Бакалавриат и специалитет",
      year: 2026,
      format: "html",
    },
  ],
});
