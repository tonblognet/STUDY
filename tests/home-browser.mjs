export default async function checkHome(page) {
  const origin = new URL(page.url()).origin;
  if (origin !== "http://127.0.0.1:3100")
    throw new Error("Home checks require the local snapshot preview");
  const paths = [
    {
      key: "college",
      label: "Колледж",
      headline: "Профессия начинается здесь",
      description:
        "Программы СПО после 9 или 11 класса. Сравните формы, сроки, опубликованные места и цены.",
      action: "Смотреть колледжи",
      href: "/programs?track=college",
      destination: "Колледжи · СПО",
    },
    {
      key: "undergraduate",
      label: "Бакалавриат и специалитет",
      headline: "Найдите своё направление",
      description:
        "Первое высшее образование. Сравните программы, предметы, места, стоимость и проходные баллы по годам.",
      action: "Смотреть программы",
      href: "/programs",
      destination: "Бакалавриат и специалитет",
    },
    {
      key: "master",
      label: "Магистратура",
      headline: "Глубже в профессию",
      description:
        "Новая специализация после высшего образования. Сравните испытания, места и стоимость обучения.",
      action: "Смотреть магистратуру",
      href: "/programs?track=master",
      destination: "Магистратура",
    },
    {
      key: "aspirantura",
      label: "Аспирантура",
      headline: "Начните своё исследование",
      description:
        "Программы аспирантуры, научные специальности и опубликованные условия приёма.",
      action: "Смотреть аспирантуру",
      href: "/programs?track=aspirantura",
      destination: "Аспирантура",
    },
    {
      key: "doctorate",
      label: "Докторантура",
      headline: "Шаг к докторской диссертации",
      description:
        "Официальные контакты и доступные сведения. Условия отдельных наборов пока уточняются.",
      action: "Информация о докторантуре",
      href: "/programs?track=doctorate",
      destination: "Докторантура",
    },
  ];
  const reports = [];
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
    tab.setDefaultNavigationTimeout(20000);
    const errors = [];
    tab.on("pageerror", () => errors.push("pageerror"));
    tab.on("response", (response) => {
      if (response.url().startsWith(origin) && response.status() >= 500)
        errors.push("same-origin 5xx");
    });
    tab.on("console", (message) => {
      if (
        message.type() === "error" &&
        message.location().url.startsWith(origin)
      )
        errors.push("app console error");
    });
    const confirm = (condition, message) => {
      if (!condition) throw new Error(`Home ${width}: ${message}`);
    };
    const panel = tab.locator("#home-level-panel");
    const choices = tab.locator("#education-levels fieldset");
    const heading = () =>
      tab.getByRole("heading", { level: 1, name: /Дальше\s*—\s*больше\./ });
    const fitsViewport = async (state) =>
      confirm(
        await tab.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
        `${state} overflows`,
      );
    const imagesReady = async () => {
      await tab.waitForFunction(
        () => {
          const images = [...document.querySelectorAll("main img")];
          return (
            images.length > 0 &&
            images.every((image) => image.complete && image.naturalWidth > 0)
          );
        },
        undefined,
        { timeout: 15000 },
      );
    };
    const openHome = async () => {
      const response = await tab.goto(`${origin}/`, {
        waitUntil: "domcontentloaded",
      });
      confirm(response?.status() === 200, "homepage did not return HTTP 200");
      await heading().waitFor({ state: "visible" });
      await tab.evaluate(() => document.fonts.ready.then(() => undefined));
      await imagesReady();
    };
    const choose = async (path) => {
      await choices.getByText(path.label, { exact: true }).click();
      await panel
        .getByRole("heading", { level: 3, name: path.headline, exact: true })
        .waitFor({ state: "visible" });
      await panel
        .getByText(path.description, { exact: true })
        .waitFor({ state: "visible" });
      confirm(
        await choices
          .getByRole("radio", { name: path.label, exact: true })
          .isChecked(),
        `${path.key} selection is not exposed`,
      );
      confirm(
        (await choices.locator("input:checked").count()) === 1,
        "exactly one education level must be selected",
      );
      const action = panel.getByRole("link", {
        name: path.action,
        exact: true,
      });
      confirm(
        (await action.getAttribute("href")) === path.href,
        `${path.key} CTA points to the wrong route`,
      );
      const text = await panel.innerText();
      if (path.key !== "undergraduate")
        confirm(!text.includes("ЕГЭ"), `${path.key} implies EGE admission`);
      if (path.key === "college") {
        confirm(
          text.includes("После 9 или 11 класса"),
          "college school bases are missing",
        );
        confirm(
          text.includes("Аттестат и испытания по специальности"),
          "college admission basis is missing",
        );
      }
      if (path.key === "doctorate") {
        confirm(
          text.includes("Набор, места и стоимость требуют проверки"),
          "unknown doctoral intake is disguised as confirmed",
        );
        confirm(
          !/Doctor in\/of|\bMBA\b/.test(text),
          "professional-development names became an academic doctorate",
        );
      }
      await fitsViewport(path.key);
      return action;
    };
    try {
      await openHome();
      confirm(
        (await tab.locator("main").count()) === 1,
        "homepage must have one main landmark",
      );
      confirm(
        (await tab.getByRole("heading", { level: 1 }).count()) === 1,
        "homepage must have one primary heading",
      );
      const rail = tab.getByRole("navigation", {
        name: "Уровни образования на главной",
        exact: true,
      });
      confirm(
        (await rail.getByRole("link").count()) === 5,
        "homepage rail must expose five real links",
      );
      for (const path of paths)
        confirm(
          (await rail
            .getByRole("link", { name: path.label, exact: true })
            .getAttribute("href")) === path.href,
          `${path.key} rail link is incorrect`,
        );
      confirm(
        (await choices.getByRole("radio").count()) === 5,
        "five native education radios are required",
      );
      confirm(
        await choices
          .getByRole("radio", { name: "Магистратура", exact: true })
          .isChecked(),
        "master must be the initial selection",
      );
      confirm(
        (await panel.getAttribute("aria-live")) === "polite",
        "selection changes must be announced",
      );
      confirm(
        (await tab.locator('[id="home-level-panel"]').count()) === 1,
        "level panel ID must be unique",
      );
      const example = tab.locator(
        'article[aria-labelledby="home-example-title"]',
      );
      await example
        .getByRole("heading", { name: "ИТ-юрист", exact: true })
        .waitFor({ state: "visible" });
      confirm(
        /480\s000\s₽/.test(await example.innerText()),
        "published annual source example is missing",
      );
      confirm(
        (await example
          .getByRole("link", {
            name: "Открыть официальный источник",
            exact: true,
          })
          .getAttribute("href")) ===
          "https://www.hse.ru/pubs/share/direct/1134850538.docx",
        "home source link does not match the published price document",
      );
      // The desktop CTA remains in the DOM while mobile uses the menu links.
      const headerAction = tab.locator("header a.nav-cta");
      confirm(
        (await headerAction.getAttribute("href")) === "/programs",
        "header CTA must open the multi-level catalogue",
      );
      confirm(
        (await headerAction.textContent())?.trim() === "Выбрать программу",
        "header CTA copy is incorrect",
      );
      if (width === 1440) await headerAction.waitFor({ state: "visible" });
      // Confirm client state is live before screenshots inspect native inputs.
      await choose(paths[3]);
      await choose(paths[2]);
      await tab.evaluate(() =>
        window.scrollTo({ top: 0, left: 0, behavior: "instant" }),
      );
      if (width === 1440) {
        await tab.setViewportSize({ width: 1487, height: 1058 });
        await fitsViewport("concept viewport");
        await tab.screenshot({
          path: "output/playwright/home-hero-1487.png",
          caret: "initial",
        });
        await tab.setViewportSize({ width, height: 1000 });
      }
      await tab.screenshot({
        path: `output/playwright/home-hero-${width}.png`,
        caret: "initial",
      });
      const heroAction = tab.getByRole("link", {
        name: "Выбрать свой путь",
        exact: true,
      });
      confirm(
        (await heroAction.getAttribute("href")) === "#education-levels",
        "hero CTA must target the level chooser",
      );
      await heroAction.click();
      await tab.waitForURL(`${origin}/#education-levels`);
      confirm(
        await tab.locator("#home-levels-title").evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return (
            rect.top >=
              (document.querySelector("header")?.getBoundingClientRect()
                .bottom ?? 0) -
                1 && rect.top < innerHeight
          );
        }),
        "hero anchor did not reveal an unobscured level heading",
      );
      const master = choices.getByRole("radio", {
        name: "Магистратура",
        exact: true,
      });
      await master.focus();
      await tab.keyboard.press("ArrowRight");
      await panel
        .getByRole("heading", {
          name: "Начните своё исследование",
          exact: true,
        })
        .waitFor({ state: "visible" });
      confirm(
        await choices
          .getByRole("radio", { name: "Аспирантура", exact: true })
          .evaluate((element) => element === document.activeElement),
        "native radio ArrowRight did not move focus",
      );
      await tab.keyboard.press("ArrowLeft");
      await panel
        .getByRole("heading", { name: "Глубже в профессию", exact: true })
        .waitFor({ state: "visible" });
      confirm(
        await master.isChecked(),
        "native radio ArrowLeft did not restore selection",
      );
      await tab.keyboard.press("Tab");
      confirm(
        await panel
          .getByRole("link", { name: "Смотреть магистратуру", exact: true })
          .evaluate((element) => element === document.activeElement),
        "Tab must leave the radio group for its action",
      );
      const visited = [];
      for (const path of paths) {
        const action = await choose(path);
        await action.click();
        await tab.waitForURL(`${origin}${path.href}`);
        await tab
          .getByRole("heading", {
            level: 1,
            name: path.destination,
            exact: true,
          })
          .waitFor({ state: "visible" });
        if (path.key === "doctorate")
          await tab
            .getByText(
              "Подтверждённые программы этого уровня ещё не добавлены. Это не означает, что учебные заведения их не предлагают.",
              { exact: true },
            )
            .waitFor({ state: "visible" });
        visited.push(path.href);
        await openHome();
      }
      await fitsViewport("final home state");
      await tab.screenshot({
        path: `output/playwright/home-${width}.png`,
        fullPage: true,
        caret: "initial",
      });
      confirm(errors.length === 0, errors.join(", "));
      reports.push({
        route: "/",
        width,
        height: 1000,
        passed: true,
        visited,
        checks: [
          "five-real-path-links",
          "five-radio-descriptions-and-actions",
          "native-radio-keyboard",
          "college-school-bases",
          "honest-doctoral-unknowns",
          "published-source-example",
          "hero-anchor",
          "all-levels-fit-viewport",
          "images-loaded",
          "no-runtime-errors",
        ],
      });
    } finally {
      await context.close();
    }
  }
  return reports;
}
