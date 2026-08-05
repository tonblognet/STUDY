import { createUniversityAdapter } from "../../core/adapter";
export default createUniversityAdapter({ slug: "mpei", name: "НИУ МЭИ", officialDomains: ["mpei.ru"], markers: ["09.03.03", "Прикладная информатика"], sources: [
  { category: "programs", url: "https://pk.mpei.ru/info/speclist", title: "Перечень направлений подготовки", year: 2026, format: "html", locator: "09.03.03, Прикладная информатика в экономике" },
  { category: "rules", url: "https://pk.mpei.ru/docs/rules_bach_2026.pdf", title: "Правила приёма бакалавриата", year: 2026, format: "pdf" },
  { category: "places", url: "https://pk.mpei.ru/docs/quotas2026.pdf", title: "Квоты 2026", year: 2026, format: "pdf" },
] });
