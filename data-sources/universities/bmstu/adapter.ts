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
    {
      category: "rules",
      url: "https://s3-oris.bmstu.ru/cms.bmstu.ru/ibm3/pravila-priema-2026.pdf",
      title: "Правила приёма 2026 года в редакции от 30 апреля",
      year: 2026,
      format: "pdf",
    },
    {
      category: "places",
      url: "https://rlm.bmstu.ru/applicants?level=bachelor",
      title: "План приёма на программы бакалавриата факультета БМТ",
      year: 2026,
      format: "html",
    },
    {
      category: "tuition",
      url: "https://course.bmstu.ru/edu/abiturient/",
      title: "Стоимость первого курса для набора 2026/2027",
      year: 2026,
      format: "html",
      locator: "Стоимость обучения",
    },
  ],
});
