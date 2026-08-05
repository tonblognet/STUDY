import { createUniversityAdapter } from "../../core/adapter";
export default createUniversityAdapter({ slug: "mai", name: "МАИ", officialDomains: ["mai.ru"], markers: ["01.03.02", "Прикладная математика"], sources: [
  { category: "programs", url: "https://priem.mai.ru/foreign-applicants/bachelor/programs/", title: "Программы бакалавриата", year: 2026, format: "html", locator: "01.03.02, Москва, очная форма" },
  { category: "exams", url: "https://priem.mai.ru/orders/programs/", title: "Перечень направлений и испытаний", year: 2026, format: "html" },
  { category: "tuition", url: "https://priem.mai.ru/orders/plan/cost/", title: "План платного приёма", year: 2026, format: "html" },
] });
