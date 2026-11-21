import { createUniversityAdapter } from "../../core/adapter";

export default createUniversityAdapter({
  slug: "gubkin",
  name: "РГУ нефти и газа имени И. М. Губкина",
  officialDomains: ["gubkin.ru"],
  markers: ["21.03.01", "21.05.02", "18.03.01"],
  sources: [
    {
      category: "programs",
      url: "https://postupai.gubkin.ru/",
      title: "Поступай в Губкинский университет",
      year: 2026,
      format: "html",
      locator: "Направления подготовки",
    },
    {
      category: "rules",
      url: "https://priem.gubkin.ru/#/page/applicants/2",
      title: "Указатель документов приёма на первый курс",
      year: 2026,
      format: "html",
    },
    {
      category: "exams",
      url: "https://priem.gubkin.ru/#/page/faq",
      title: "Разъяснения по срокам и минимальным баллам",
      year: 2026,
      format: "html",
      locator: "Вопросы и ответы",
    },
    {
      category: "results",
      url: "https://gubkin.ru/sveden/education/",
      title: "Численность зачисленных и средние баллы 2026 года",
      year: 2026,
      format: "html",
      locator: "Результаты приема",
    },
  ],
});
