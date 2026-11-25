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
    {
      category: "rules",
      url: "https://admission.mephi.ru/admission/baccalaureate-and-specialty/documents",
      title: "Документы приёмной кампании 2026 года",
      year: 2026,
      format: "html",
    },
    {
      category: "places",
      url: "https://admission.mephi.ru/admission/baccalaureate-and-specialty/education/moscow",
      title: "Контрольные цифры приёма в Москве",
      year: 2026,
      format: "html",
    },
    {
      category: "exams",
      url: "https://admission.mephi.ru/admission/baccalaureate-and-specialty/exams/list",
      title: "Вступительные испытания и минимальные баллы",
      year: 2026,
      format: "html",
    },
    {
      category: "results",
      url: "https://mephi.ru/press/news/26374",
      title: "Итоги бюджетного приёма 7 августа 2026 года",
      year: 2026,
      format: "html",
    },
  ],
});
