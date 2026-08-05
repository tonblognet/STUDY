import { createUniversityAdapter } from "../../core/adapter";
export default createUniversityAdapter({ slug: "ranepa", name: "РАНХиГС", officialDomains: ["ranepa.ru"], markers: ["09.03.03", "Цифровые технологии"], sources: [
  { category: "exams", url: "https://www.ranepa.ru/upload/doc/pk/2026/Perechen_VI-2026.pdf.pdf", title: "Перечень вступительных испытаний 2026", year: 2026, format: "pdf", locator: "09.03.03" },
  { category: "rules", url: "https://www.ranepa.ru/bakalavriat/obshchie-osnovaniya/", title: "Общие основания приёма", year: 2026, format: "html" },
  { category: "programs", url: "https://www.ranepa.ru/bakalavriat/", title: "Бакалавриат и специалитет", year: 2026, format: "html" },
] });
