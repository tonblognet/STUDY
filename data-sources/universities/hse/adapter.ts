import { createUniversityAdapter } from "../../core/adapter";
export default createUniversityAdapter({
  slug: "hse",
  name: "НИУ ВШЭ",
  officialDomains: ["hse.ru"],
  markers: ["Экономика", "38.03.01"],
  sources: [
    {
      category: "programs",
      url: "https://www.hse.ru/mirror/pubs/share/1162982432.pdf",
      title: "Сводная информация по программам бакалавриата и специалитета",
      year: 2026,
      format: "pdf",
      locator: "стр. 6, Экономика 38.03.01",
    },
    {
      category: "places",
      url: "https://ba.hse.ru/kolmest",
      title: "Количество мест для приёма",
      year: 2026,
      format: "html",
    },
    {
      category: "rules",
      url: "https://www.hse.ru/docs/1019487685.html",
      title: "Правила приёма",
      year: 2026,
      format: "html",
    },
  ],
});
