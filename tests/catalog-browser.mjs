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
    const finish = async (route) => {
      confirm(
        await tab.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
        `${route} overflows`,
      );
      reports.push({ route, width, height, passed: true });
    };
    try {
      for (const slug of ["mpei-applied-informatics", "rudn-applied-math"]) {
        const route = `/programs/${slug}`;
        await navigate(route);
        const exams = tab.locator("#exams");
        await visible(exams.getByText("Физика: минимум 41", { exact: true }));
        await visible(
          exams.getByText("Информатика: минимум 46", { exact: true }),
        );
        const fit = tab.locator("#fit");
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
              .locator("#cost")
              .getByText(/285\s000\s₽\/год/)
              .first(),
          );
          confirm(
            (await tab
              .locator("#quotas .sourced-metric-conflicting_sources")
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
        await tab
          .locator("#exams")
          .screenshot({
            path: `output/playwright/contest-${slug}-${width}.png`,
          });
        await finish(route);
      }

      const university = "/universities/rudn";
      await navigate(university);
      const faculties = tab.locator("#faculties");
      await visible(
        faculties.getByRole("heading", { name: "Факультеты и институты · 12" }),
      );
      const offerings = tab.locator('[aria-labelledby="offerings-heading"]');
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
      await offerings.screenshot({
        path: `output/playwright/directory-rudn-${width}.png`,
      });
      await finish(university);
      confirm(errors.length === 0, errors.join(", "));
    } finally {
      await context.close();
    }
  }
  return reports;
}
