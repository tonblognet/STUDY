export default async function checkCatalog(page) {
  const origin = new URL(page.url()).origin;
  if (!["http://127.0.0.1:3100", "http://127.0.0.1:3101"].includes(origin)) {
    throw new Error(
      "Catalog browser checks require the local snapshot preview",
    );
  }
  const reports = [];
  for (const [width, height] of [
    [1440, 1000],
    [390, 844],
  ]) {
    const context = await page
      .context()
      .browser()
      .newContext({ viewport: { width, height } });
    const tab = await context.newPage();
    const errors = [];
    tab.on("pageerror", (error) => errors.push(error.name));
    tab.on("response", (response) => {
      if (response.url().startsWith(origin) && response.status() >= 500)
        errors.push("same-origin 5xx");
    });
    tab.on("console", (message) => {
      if (
        message.type() === "error" &&
        message.location().url.startsWith(`${origin}/_next/`)
      ) {
        errors.push("app console error");
      }
    });
    const visible = (locator) =>
      locator.waitFor({ state: "visible", timeout: 8000 });
    const confirm = (condition, message) => {
      if (!condition) throw new Error(`${width}: ${message}`);
    };
    const navigate = async (route) => {
      const response = await tab.goto(`${origin}${route}`, {
        waitUntil: "domcontentloaded",
      });
      confirm(
        response?.status() === 200,
        `${route} did not respond with HTTP 200`,
      );
    };
    const finish = async (route, checks) => {
      confirm(
        await tab.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
        `${route} overflows`,
      );
      reports.push({
        route,
        width,
        height,
        passed: true,
        ...(checks ? { checks } : {}),
      });
    };
    try {
      for (const slug of ["mpei-applied-informatics", "rudn-applied-math"]) {
        const route = `/programs/${slug}`;
        await navigate(route);
        const exams = tab.locator("#exams:visible");
        await visible(exams.getByText("Физика: минимум 41", { exact: true }));
        await visible(
          exams.getByText("Информатика: минимум 46", { exact: true }),
        );
        const fit = tab.locator("#fit:visible");
        const score = (label) => fit.getByLabel(label, { exact: true });
        const result = fit.locator(".fit-result");
        await score("Математика").fill("40");
        await score("Русский язык").fill("40");
        await score("Информатика").fill("45");
        await visible(
          result.getByText("Информатика: 45, минимум 46", { exact: true }),
        );
        await score("Физика").fill("41");
        await score("Инд. достижения").fill("10");
        await visible(result.getByText(/Учитываемая сумма:\s*131\b/));
        if (slug === "rudn-applied-math") {
          await visible(
            tab.getByRole("heading", {
              level: 1,
              name: /Прикладная математика и программирование/,
            }),
          );
          await visible(
            tab
              .locator("#cost:visible")
              .getByText(/285\s000\s₽\/год/)
              .first(),
          );
          confirm(
            (await tab
              .locator("#quotas:visible .sourced-metric-conflicting_sources")
              .count()) === 2,
            "RUDN quota conflicts were hidden",
          );
          await visible(result.getByText(/Запас \/ дефицит:\s*—\./));
        } else {
          await score("Математика").fill("90");
          await score("Русский язык").fill("90");
          await score("Информатика").fill("90");
          await score("Инд. достижения").fill("0");
          await visible(result.getByText(/Запас \/ дефицит:\s*9\./));
        }
        await tab.evaluate(() =>
          window.scrollTo({ top: 0, left: 0, behavior: "instant" }),
        );
        await tab.screenshot({
          path: `output/playwright/contest-${slug}-${width}.png`,
          fullPage: true,
        });
        await finish(route);
      }

      const university = "/universities/rudn";
      await navigate(university);
      const faculties = tab.locator("#faculties:visible");
      await visible(
        faculties.getByRole("heading", { name: "Факультеты и институты · 12" }),
      );
      const offerings = tab.locator(
        '[aria-labelledby="offerings-heading"]:visible',
      );
      await visible(
        offerings.getByText("Найдено направлений и профилей: 165 из 165"),
      );
      await visible(
        offerings
          .getByText("Год набора не подтверждён.", { exact: false })
          .first(),
      );
      await offerings
        .getByRole("button", { name: "Показать ещё 12 направлений" })
        .click();
      await visible(offerings.locator("article").nth(23));
      const search = offerings.getByRole("searchbox");
      await search.fill("zz-fixture-missing");
      await visible(
        offerings.getByText("Направление не найдено.", { exact: false }),
      );
      await search.fill("01.03.02");
      await visible(
        offerings
          .locator("article")
          .first()
          .getByText("01.03.02", { exact: true }),
      );
      const source = offerings
        .getByRole("link", { name: "Официальный перечень ↗" })
        .first();
      confirm(
        (await source.getAttribute("href")) ===
          "https://www.rudn.ru/sveden/education/eduaccred/",
        "RUDN listing source changed",
      );
      await tab.evaluate(() =>
        window.scrollTo({ top: 0, left: 0, behavior: "instant" }),
      );
      await tab.screenshot({
        path: `output/playwright/directory-rudn-${width}.png`,
        fullPage: true,
      });
      await finish(university);

      const hse = "/universities/hse";
      await navigate(hse);
      const hsePrograms = tab.locator("#programs:visible");
      const hseQuery = hsePrograms.getByRole("searchbox", {
        name: "Найти программу ВШЭ",
      });
      const hseCampus = hsePrograms.getByLabel("Кампус ВШЭ", { exact: true });
      const hseLevel = hsePrograms.getByLabel("Уровень образования ВШЭ", {
        exact: true,
      });
      const hseFaculty = hsePrograms.getByLabel("Подразделение ВШЭ", {
        exact: true,
      });
      const hseForm = hsePrograms.getByLabel("Форма обучения ВШЭ", {
        exact: true,
      });
      const hseFunding = hsePrograms.getByLabel("Оплата обучения ВШЭ", {
        exact: true,
      });
      const hseMaxTuition = hsePrograms.getByRole("spinbutton", {
        name: "Стоимость года до, ₽",
        exact: true,
      });
      const hseYear = hsePrograms.getByLabel("Год набора ВШЭ", {
        exact: true,
      });
      const hseConditions = hsePrograms.getByLabel("Известные условия ВШЭ", {
        exact: true,
      });
      const hseChecks = [];
      const hseEmpty = hsePrograms.getByText(
        "Программы не найдены. Измените запрос или фильтры.",
        { exact: true },
      );
      const noHseRows = async () => {
        await visible(hseEmpty);
        confirm(
          (await hsePrograms.locator("article").count()) === 0,
          "HSE empty result retained a program card",
        );
      };
      const resetHse = async () => {
        await hsePrograms
          .getByRole("button", { name: "Сбросить фильтры", exact: true })
          .click();
        await tab.waitForFunction(
          () =>
            [
              ...document.querySelectorAll("#programs input, #programs select"),
            ].every((control) => control.value === ""),
          undefined,
          { timeout: 8000 },
        );
      };
      await hseCampus.selectOption("Пермь");
      await hseLevel.selectOption("Магистратура");
      await hseQuery.fill("ИТ-юрист");
      const master = hsePrograms.locator("article").filter({
        has: tab.getByRole("heading", { name: "ИТ-юрист", exact: true }),
      });
      await visible(master.getByText(/480\s000\s₽\/год/));
      await hseFaculty.selectOption("Магистерская школа");
      await hseForm.selectOption("Очная");
      await hseFunding.selectOption("paid");
      await hseYear.selectOption("2026");
      await hseConditions.selectOption("known");
      await hseMaxTuition.fill("480000");
      await visible(master.getByText(/480\s000\s₽\/год/));
      await visible(master.getByText("Магистерская школа", { exact: true }));
      await visible(master.getByRole("link", { name: "100", exact: true }));
      confirm(
        (await hsePrograms.locator("article").count()) === 1,
        "HSE combined master filters did not isolate the Perm admission record",
      );
      await hseMaxTuition.fill("479999");
      await noHseRows();
      await hseMaxTuition.fill("480000");
      await visible(master);
      await hseFunding.selectOption("budget");
      await noHseRows();
      await hseFunding.selectOption("paid");
      await visible(master);
      hseChecks.push("master-faculty-form-funding-annual-cost-year-known");
      await resetHse();
      await hseQuery.fill("unpublished-program-query");
      await noHseRows();
      await resetHse();

      // The official BA snapshot names both the legal in-person form and online delivery.
      await hseQuery.fill("Компьютерные науки и анализ данных");
      await hseCampus.selectOption("Москва");
      await hseLevel.selectOption("Бакалавриат");
      await hseFaculty.selectOption("Факультет компьютерных наук");
      await hseForm.selectOption("Онлайн");
      await hseFunding.selectOption("budget");
      await hseYear.selectOption("2026");
      await hseMaxTuition.fill("640000");
      await hseConditions.selectOption("known");
      const onlineBachelor = hsePrograms.locator("article").filter({
        has: tab.getByRole("link", {
          name: "Условия поступления и проверка баллов — Компьютерные науки и анализ данных",
          exact: true,
        }),
      });
      await visible(onlineBachelor.getByText(/640\s000\s₽\/год/));
      await hseForm.selectOption("Очная");
      await visible(onlineBachelor);
      await hseForm.selectOption("Очно-заочная");
      await noHseRows();
      hseChecks.push("online-and-in-person-modes-remain-distinct");
      await resetHse();

      // This exact specialty has three campuses in the official graduate-school table.
      await hseLevel.selectOption("Аспирантура");
      await hseFaculty.selectOption("Аспирантская школа по математике");
      await hseConditions.selectOption("needs-review");
      await hseQuery.fill("Вещественный, комплексный и функциональный анализ");
      const graduateSchool = hsePrograms.locator("article").filter({
        has: tab.getByRole("heading", {
          name: "Вещественный, комплексный и функциональный анализ",
          exact: true,
        }),
      });
      for (const campus of ["Москва", "Нижний Новгород", "Санкт-Петербург"]) {
        await hseCampus.selectOption(campus);
        await visible(graduateSchool);
        confirm(
          (await hsePrograms.locator("article").count()) === 1,
          `HSE graduate specialty lost its ${campus} membership`,
        );
      }
      confirm(
        (await graduateSchool
          .getByRole("link", { name: "Официальный перечень ↗", exact: true })
          .getAttribute("href")) === "https://aspirantura.hse.ru/spec",
        "HSE graduate specialty source changed",
      );
      await hseCampus.selectOption("Пермь");
      await noHseRows();
      await hseCampus.selectOption("Москва");
      await hseConditions.selectOption("needs-review");
      await visible(graduateSchool);
      await visible(
        graduateSchool.getByText("Год набора в общем каталоге не указан.", {
          exact: true,
        }),
      );
      await hseConditions.selectOption("known");
      await noHseRows();
      await hseConditions.selectOption("needs-review");
      await hseYear.selectOption("2026");
      await noHseRows();
      await hseYear.selectOption("");
      await visible(graduateSchool);
      await hseForm.selectOption("Очная");
      await noHseRows();
      hseChecks.push(
        "graduate-school-explicit-faculty-multi-campus-unknown-conditions",
      );
      await resetHse();

      // DPO subject areas do not establish a faculty or current admission conditions.
      await hseQuery.fill("Менеджмент игровых проектов");
      await hseLevel.selectOption("Профессиональная переподготовка");
      await hseConditions.selectOption("needs-review");
      const dpo = hsePrograms.locator("article").filter({
        has: tab.getByRole("heading", {
          name: "Менеджмент игровых проектов",
          exact: true,
        }),
      });
      await visible(dpo);
      await hseFaculty.selectOption("Магистерская школа");
      await noHseRows();
      await hseFaculty.selectOption("");
      await hseYear.selectOption("2026");
      await noHseRows();
      hseChecks.push("dpo-subject-area-does-not-invent-faculty-or-campaign");
      await resetHse();

      // The source publishes 7,200 RUB for this online specialization without a billing period.
      await hseQuery.fill("Алгоритмы и структуры данных");
      await hseLevel.selectOption("Специализация");
      await hseForm.selectOption("Онлайн");
      await hseConditions.selectOption("needs-review");
      const course = hsePrograms.locator("article").filter({
        has: tab.getByRole("heading", {
          name: "Алгоритмы и структуры данных",
          exact: true,
        }),
      });
      const coursePrice = course.getByRole("link", {
        name: /7\s200 RUB · период оплаты не указан/,
      });
      await visible(coursePrice);
      confirm(
        (await coursePrice.getAttribute("href")) ===
          "https://www.hse.ru/n/education/online/page/9",
        "HSE published course price lost its catalogue source",
      );
      confirm(
        (await course.getByText("Стоимость года", { exact: true }).count()) ===
          0,
        "HSE course price was presented as annual tuition",
      );
      await hseMaxTuition.fill("1000000");
      await noHseRows();
      await hseMaxTuition.fill("");
      await visible(course);
      await hseFunding.selectOption("paid");
      await noHseRows();
      await hseFunding.selectOption("");
      await hseConditions.selectOption("known");
      await noHseRows();
      await hseConditions.selectOption("needs-review");
      await visible(coursePrice);
      hseChecks.push(
        "published-course-price-is-neither-annual-tuition-nor-paid-places",
      );
      await resetHse();

      await hseQuery.fill("Математика");
      await hseCampus.selectOption("Москва");
      await hseLevel.selectOption("Бакалавриат");
      const hseMath = hsePrograms.getByRole("link", {
        name: "Условия поступления и проверка баллов — Математика",
        exact: true,
      });
      await visible(hseMath);
      const mathCard = hsePrograms.locator("article").filter({
        has: tab.getByRole("link", {
          name: "Условия поступления и проверка баллов — Математика",
          exact: true,
        }),
      });
      await visible(mathCard.getByRole("link", { name: "282", exact: true }));
      await visible(mathCard.getByRole("link", { name: "250", exact: true }));
      confirm(
        (await hseMath.getAttribute("href")) === "/programs/hse-math",
        "HSE contest link missing",
      );
      await tab.screenshot({
        path: `output/playwright/directory-hse-${width}.png`,
        fullPage: true,
      });
      await finish(hse, hseChecks);

      const math = "/programs/hse-math";
      await hseMath.click();
      await tab.waitForURL(`${origin}${math}`);
      const fit = tab.locator("#fit:visible");
      const budget = fit.locator("figure").filter({
        has: tab.getByRole("heading", {
          name: "Проходной балл на бюджет",
          exact: true,
        }),
      });
      const paid = fit.locator("figure").filter({
        has: tab.getByRole("heading", {
          name: "Проходной балл на платное обучение",
          exact: true,
        }),
      });
      await visible(budget.getByText("2025 · 282", { exact: true }));
      await visible(paid.getByText("2025 · 250", { exact: true }));
      for (const figure of [budget, paid]) {
        const source = figure.getByRole("link", {
          name: "Официальный источник ↗",
        });
        confirm(
          (await source.getAttribute("href")) ===
            "https://ba.hse.ru/result2025",
          "HSE results source missing",
        );
      }
      await visible(
        tab
          .locator("#cost:visible .sourced-metric")
          .getByText(/560\s000\s₽\/год/),
      );
      await fit
        .getByRole("spinbutton", { name: "Математика", exact: true })
        .fill("75");
      await fit
        .getByRole("spinbutton", { name: "Русский язык", exact: true })
        .fill("65");
      const physics = fit.getByRole("spinbutton", {
        name: "Физика",
        exact: true,
      });
      await physics.fill("69");
      await visible(
        fit
          .locator(".fit-result")
          .getByText("Физика: 69, минимум 70", { exact: true }),
      );
      await physics.fill("70");
      await visible(
        fit.locator(".fit-result").getByText(/Учитываемая сумма:\s*210\b/),
      );
      await visible(
        fit.locator(".fit-result").getByText(/Запас \/ дефицит:\s*—\./),
      );
      await tab.evaluate(() =>
        window.scrollTo({ top: 0, left: 0, behavior: "instant" }),
      );
      await tab.screenshot({
        path: `output/playwright/contest-hse-math-${width}.png`,
        fullPage: true,
      });
      await finish(math);
      confirm(errors.length === 0, errors.join(", "));
    } finally {
      await context.close();
    }
  }
  return reports;
}
