import { createUniversityAdapter } from "../../core/adapter";
export default createUniversityAdapter({
  slug: "misis",
  name: "НИТУ МИСИС",
  officialDomains: ["misis.ru"],
  markers: ["27.03.03", "Системный анализ", "440 000"],
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
      url: "https://misis.ru/files/-/b896946f5903e48b7d131802db33894f/_u041F_u0440_u0430_u0432_u0438_u043B_u0430_20_u043F_u0440_u0438_u0435_u043C_u0430_20_u0431_u0430_u043A_20_u0418_u0422_u041E_u0413.pdf",
      title: "Правила приёма на 2026/27 учебный год",
      year: 2026,
      format: "pdf",
      locator: "Приложение 2, контрольные цифры головного отделения",
    },
    {
      category: "tuition",
      url: "https://misis.ru/files/-/360c93b2b90f44c30fe80682def446c0/prikaz-_u2116255o.v.-ot-29.05.2026-1-kurs.pdf",
      title: "Приказ от 29.05.2026 № 255о.в. о стоимости первого курса",
      year: 2026,
      format: "pdf",
      locator: "Приложение 1, страница 3",
    },
    {
      category: "results",
      url: "https://misis.ru/applicants/admission/baccalaureate-and-specialty/list/prohodnyebally/",
      title: "Бюджетные и платные проходные баллы",
      year: 2026,
      format: "html",
      locator: "Отдельные таблицы бюджета и договора, колонка 2026",
    },
  ],
});
