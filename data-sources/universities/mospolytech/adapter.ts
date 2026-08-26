import { createUniversityAdapter } from "../../core/adapter";

export default createUniversityAdapter({
  slug: "mospolytech",
  name: "Московский Политех",
  officialDomains: ["mospolytech.ru"],
  markers: ["09.03.01", "23.03.03", "54.03.01"],
  sources: [
    {
      category: "programs",
      url: "https://mospolytech.ru/upload/iblock/191/ykedf9chhmhzr36p3ip9uiqca21sebgi/4.1_Moskva.pdf",
      title: "Перечень образовательных программ, Москва",
      year: 2026,
      format: "pdf",
      locator: "Таблица 4.1, направления и специальности",
    },
  ],
});
