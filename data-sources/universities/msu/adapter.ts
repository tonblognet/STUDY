import { createUniversityAdapter } from "../../core/adapter";
export default createUniversityAdapter({ slug: "mgu", name: "МГУ", officialDomains: ["msu.ru"], markers: ["Экономика", "вступительные испытания"], sources: [
  { category: "programs", url: "https://www.econ.msu.ru/entrance/bachelor/2026/", title: "Приём на бакалавриат экономического факультета", year: 2026, format: "html", locator: "Экономика" },
  { category: "rules", url: "https://cpk.msu.ru/", title: "Центральная приёмная комиссия МГУ", year: 2026, format: "html" },
] });
