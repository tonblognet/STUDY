import { createUniversityAdapter } from "../../core/adapter";
export default createUniversityAdapter({
  slug: "mipt",
  name: "МФТИ",
  officialDomains: ["mipt.ru"],
  markers: ["01.03.02", "180"],
  sources: [
    {
      category: "places",
      url: "https://pk.mipt.ru/bachelor/2026_places/",
      title: "Количество мест бакалавриата",
      year: 2026,
      format: "html",
      locator: "01.03.02",
    },
    {
      category: "programs",
      url: "https://pk.mipt.ru/bachelor/",
      title: "Поступление в бакалавриат",
      year: 2026,
      format: "html",
    },
  ],
});
