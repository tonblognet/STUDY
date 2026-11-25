export default async function checkEducationPathways(page) {
  const origin = new URL(page.url()).origin;
  if (origin !== "http://127.0.0.1:3100")
    throw new Error("Snapshot preview required");
  const reports = [];
  const confirm = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  for (const width of [1440, 390]) {
    const context = await page
      .context()
      .browser()
      .newContext({
        viewport: { width, height: 1000 },
        reducedMotion: "reduce",
      });
    const tab = await context.newPage();
    tab.setDefaultTimeout(10000);
    const errors = [];
    tab.on("pageerror", () => errors.push("pageerror"));
    tab.on("response", (response) => {
      if (response.url().startsWith(origin) && response.status() >= 500)
        errors.push("5xx");
    });
    try {
      await tab.goto(`${origin}/programs`, { waitUntil: "domcontentloaded" });
      await tab
        .getByRole("navigation", { name: "Уровень образования", exact: true })
        .getByRole("link", { name: "Магистратура", exact: true })
        .click();
      await tab
        .getByRole("heading", { name: "Магистратура", level: 1, exact: true })
        .waitFor();
      await tab
        .getByLabel("Учебное заведение", { exact: true })
        .selectOption("hse");
      await tab
        .getByLabel("Город или кампус", { exact: true })
        .selectOption("Пермь");
      await tab
        .getByLabel("Название или код программы", { exact: true })
        .fill("ИТ-юрист");
      const law = tab.getByRole("article").filter({
        has: tab.getByRole("heading", { name: "ИТ-юрист", exact: true }),
      });
      await law.waitFor();
      confirm(
        (await law.innerText()).includes("480"),
        "Known annual master tuition missing",
      );
      await tab
        .getByLabel("Стоимость года до, ₽", { exact: true })
        .fill("479999");
      await tab
        .getByText(
          "По выбранным фильтрам записей нет. Попробуйте расширить поиск.",
          { exact: true },
        )
        .waitFor();
      await tab
        .getByLabel("Стоимость года до, ₽", { exact: true })
        .fill("480000");
      await law.waitFor();
      await tab
        .getByRole("button", { name: "Сбросить фильтры", exact: true })
        .click();
      confirm(
        (await tab
          .getByLabel("Учебное заведение", { exact: true })
          .inputValue()) === "",
        "Reset must clear university",
      );
      confirm(
        (await tab.getByRole("button", { name: /ЕГЭ/ }).count()) === 0,
        "Master route must use its own admissions basis",
      );
      await tab.screenshot({
        path: `output/playwright/pathway-master-${width}.png`,
        fullPage: true,
      });
      reports.push({ route: "/programs?track=master", width, passed: true });

      await tab
        .getByRole("navigation", { name: "Уровень образования", exact: true })
        .getByRole("link", { name: "Аспирантура", exact: true })
        .click();
      await tab
        .getByRole("heading", { name: "Аспирантура", level: 1, exact: true })
        .waitFor();
      await tab.getByLabel("Год набора", { exact: true }).selectOption("2026");
      await tab
        .getByLabel("Город или кампус", { exact: true })
        .selectOption("Москва");
      await tab
        .getByLabel("Название или код программы", { exact: true })
        .fill("Математика и механика");
      const math = tab.getByRole("article").filter({
        has: tab.getByRole("heading", {
          name: "Математика и механика",
          exact: true,
        }),
      });
      await math.waitFor();
      confirm(
        (await math.innerText()).includes("24"),
        "Program-specific ASP budget missing",
      );
      confirm(
        !(await math.innerText()).includes("386"),
        "University-wide quota must not become programme quota",
      );
      await tab
        .getByLabel("Финансирование", { exact: true })
        .selectOption("paid");
      await tab
        .getByText(
          "По выбранным фильтрам записей нет. Попробуйте расширить поиск.",
          { exact: true },
        )
        .waitFor();
      await tab
        .getByRole("button", { name: "Сбросить фильтры", exact: true })
        .click();
      await tab.screenshot({
        path: `output/playwright/pathway-aspirantura-${width}.png`,
        fullPage: true,
      });
      reports.push({
        route: "/programs?track=aspirantura",
        width,
        passed: true,
      });

      await tab
        .getByRole("navigation", { name: "Уровень образования", exact: true })
        .getByRole("link", { name: "Докторантура", exact: true })
        .click();
      await tab
        .getByRole("heading", { name: "Докторантура", level: 1, exact: true })
        .waitFor();
      await tab
        .getByText(
          "Подтверждённые программы этого уровня ещё не добавлены. Это не означает, что учебные заведения их не предлагают.",
          { exact: true },
        )
        .waitFor();
      confirm(
        (await tab.getByRole("article").count()) === 0,
        "DPO Doctor must not become Russian doctorate",
      );
      await tab.screenshot({
        path: `output/playwright/pathway-doctorate-${width}.png`,
        fullPage: true,
      });
      reports.push({ route: "/programs?track=doctorate", width, passed: true });

      await tab
        .getByRole("navigation", { name: "Уровень образования", exact: true })
        .getByRole("link", { name: "Колледжи · СПО", exact: true })
        .click();
      await tab
        .getByRole("heading", { name: "Колледжи · СПО", level: 1, exact: true })
        .waitFor();
      await tab
        .getByLabel("Образование до колледжа", { exact: true })
        .selectOption("9");
      await tab
        .getByLabel("Название или код программы", { exact: true })
        .fill("Дизайн");
      const design = tab
        .getByRole("article")
        .filter({ has: tab.getByRole("heading", { name: /Дизайн/ }) });
      await design.first().waitFor();
      confirm(
        (await design.first().innerText()).includes("660"),
        "Published design tuition must not be replaced with advertised discount",
      );
      confirm(
        (await design.first().innerText()).includes("Рисунок"),
        "College creative exam missing",
      );
      await tab
        .getByRole("button", { name: "Сбросить фильтры", exact: true })
        .click();
      await tab.screenshot({
        path: `output/playwright/pathway-college-${width}.png`,
        fullPage: true,
      });
      reports.push({ route: "/programs?track=college", width, passed: true });
      const overflow = await tab.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      );
      confirm(!overflow, "Pathway route must fit viewport");
      confirm(
        errors.length === 0,
        "Pathway routes must have no runtime or server errors",
      );
    } finally {
      await context.close();
    }
  }
  return reports;
}
