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
  ],
});
