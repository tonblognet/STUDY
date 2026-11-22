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
    {
      category: "rules",
      url: "https://msal.ru/upload/iblock/375/dv1dqy6ckb5jhf34ev5zkz7fs7bxh5a3.pdf",
      title: "Правила приёма 2026 года",
      year: 2026,
      format: "pdf",
      locator: "Приложение к приказу № 3 от 19.01.2026",
    },
    {
      category: "exams",
      url: "https://msal.ru/upload/iblock/3d5/7hwfaogrknyx0lb1hvdzy1vfosywg1di.pdf",
      title: "Перечень вступительных испытаний и минимальных баллов",
      year: 2026,
      format: "pdf",
    },
    {
      category: "places",
      url: "https://msal.ru/upload/iblock/fad/q2ji60gh3vi4wz2k3itmlpzwpjco287q.pdf",
      title: "Места и квоты 2026 по конкурсным группам",
      year: 2026,
      format: "pdf",
      locator: "Университет (г. Москва)",
    },
    {
      category: "tuition",
      url: "https://msal.ru/upload/iblock/ebb/pfhavhft8qn09cnvn5kshf82indsvbwl.pdf",
      title: "Стоимость первого года обучения в 2026/2027 учебном году",
      year: 2026,
      format: "pdf",
      locator: "Бакалавриат и специалитет, страницы 2–3",
    },
    {
      category: "results",
      url: "https://msal.ru/upload/iblock/634/sz7h9umpjnrk8pcwk1x4b0crh5tbmsyy.pdf",
      title: "Проходные баллы в университет в 2026 году",
      year: 2026,
      format: "pdf",
    },
    {
      category: "results",
      url: "https://msal.ru/content/abiturientam/priemnaya-kampaniya/informatsiya-o-zachislenii/",
      title: "Сведения о зачислении по приказам 2026 года",
      year: 2026,
      format: "html",
    },
  ],
});
