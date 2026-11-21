import { createUniversityAdapter } from "../../core/adapter";

export default createUniversityAdapter({
  slug: "muctr",
  name: "РХТУ им. Д. И. Менделеева",
  officialDomains: ["muctr.ru"],
  markers: ["18.03.01", "19.03.01", "04.05.01"],
  sources: [
    {
      category: "programs",
      url: "https://chemeng2030.muctr.ru/",
      title: "Поступление в РХТУ в 2026 году",
      year: 2026,
      format: "html",
      locator: "Образовательные программы",
    },
    {
      category: "rules",
      url: "https://ideco.muctr.ru/abitur/bachelor/main_info/",
      title: "Правила и документы приёма 2026 года",
      year: 2026,
      format: "html",
      locator: "Правила приема",
    },
    {
      category: "exams",
      url: "https://ideco.muctr.ru/abitur/bachelor/entrance_tests/tests/",
      title: "Вступительные испытания и минимальные баллы 2026 года",
      year: 2026,
      format: "html",
      locator: "Перечень вступительных испытаний",
    },
    {
      category: "places",
      url: "https://ideco.muctr.ru/abitur/bachelor/number-seats/",
      title: "Бюджетные и платные места и квоты 2026 года",
      year: 2026,
      format: "html",
      locator: "Код и наименование направления подготовки (специальности)",
    },
    {
      category: "tuition",
      url: "https://ideco.muctr.ru/upload/iblock/820/d6oie1l8oswl5krfucqtkhgqefy7srl9.pdf",
      title:
        "Прейскурант для поступивших на первый курс в 2026/2027 учебном году",
      year: 2026,
      format: "pdf",
      locator: "Приказ № 110 ОД от 01.06.2026, приложение № 1",
    },
    {
      category: "results",
      url: "https://ideco.muctr.ru/abitur/bachelor/pk/lits/",
      title: "Приказы о зачислении в РХТУ в 2026 году",
      year: 2026,
      format: "html",
      locator: "Приказы № 1445 СТ, 1446 СТ, 1459 СТ, 1565 СТ, 1567 СТ",
    },
  ],
});
