import { createUniversityAdapter } from "../../core/adapter";

export default createUniversityAdapter({
  slug: "pirogov",
  name: "Пироговский Университет",
  officialDomains: ["rsmu.ru"],
  markers: ["31.05.01", "31.05.02", "33.05.01"],
  sources: [
    {
      category: "programs",
      url: "https://rsmu.ru/abitur/bachelor",
      title: "Приёмная кампания 2026: специалитет",
      year: 2026,
      format: "html",
      locator:
        "Программы специалитета, базового высшего образования и бакалавриата",
    },
  ],
});
