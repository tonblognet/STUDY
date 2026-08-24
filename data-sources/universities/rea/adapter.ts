import { createUniversityAdapter } from "../../core/adapter";
export default createUniversityAdapter({
  slug: "rea",
  name: "РЭУ им. Г. В. Плеханова",
  officialDomains: ["rea.ru"],
  markers: ["40.03.01", "Международное право"],
  sources: [
    {
      category: "programs",
      url: "https://www.rea.ru/~ed-program/c88bd4a72ab29c65152ad515b3d23beb",
      title: "Международное право и сравнительное правоведение",
      year: 2026,
      format: "html",
      locator: "40.03.01",
    },
    {
      category: "rules",
      url: "https://www.rea.ru/ru/org/managements/priem/Pages/default.aspx",
      title: "Приёмная комиссия",
      year: 2026,
      format: "html",
    },
  ],
});
