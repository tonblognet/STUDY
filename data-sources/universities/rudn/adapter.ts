import { createUniversityAdapter } from "../../core/adapter";
export default createUniversityAdapter({ slug: "rudn", name: "РУДН", officialDomains: ["rudn.ru"], markers: ["01.03.02", "49"], sources: [
  { category: "places", url: "https://admission.rudn.ru/pk/2026/count/kcp_26_1.pdf", title: "Количество мест для приёма в 2026 году", year: 2026, format: "pdf", locator: "стр. 2, ФФМиЕН, 01.03.02" },
  { category: "rules", url: "https://admission.rudn.ru/pk/2026/adm_rules/bs/pp_bsm_26.pdf", title: "Правила приёма", year: 2026, format: "pdf" },
] });
