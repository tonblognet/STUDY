export default async function checkAccessibility(page, config) {
  const origin = new URL(page.url()).origin;
  if (origin !== "http://127.0.0.1:3100")
    throw new Error("Accessibility checks require the snapshot preview");
  const context = await page
    .context()
    .browser()
    .newContext({
      viewport: { width: config.width, height: 1000 },
      reducedMotion: "reduce",
    });
  const tab = await context.newPage();
  tab.setDefaultTimeout(10_000);
  tab.setDefaultNavigationTimeout(20_000);
  const errors = [];
  const reports = [];
  tab.on("pageerror", () => errors.push("pageerror"));
  tab.on("response", (response) => {
    if (response.url().startsWith(origin) && response.status() >= 500)
      errors.push("same-origin 5xx");
  });
  const confirm = (condition) => {
    if (!condition) throw new Error("Accessibility interaction failed");
  };
  const dialogControls = (dialog) =>
    dialog.locator(
      'a[href]:not([tabindex="-1"]):visible, button:enabled:not([tabindex="-1"]):visible, input:enabled:not([type="hidden"]):not([tabindex="-1"]):visible, select:enabled:not([tabindex="-1"]):visible, textarea:enabled:not([tabindex="-1"]):visible, [tabindex="0"]:visible',
    );
  const trap = async (dialog, firstControl, lastControl, setPhase) => {
    const controls = dialogControls(dialog);
    const first = firstControl ?? controls.first(),
      last = lastControl ?? controls.last();
    setPhase("dialog_initial_focus");
    await first.and(tab.locator(":focus")).waitFor({ state: "visible" });
    setPhase("dialog_last_focus");
    await last.focus();
    confirm(
      await last.evaluate((element) => element === document.activeElement),
    );
    setPhase("dialog_tab_forward");
    await tab.keyboard.press("Tab");
    confirm(
      await first.evaluate((element) => element === document.activeElement),
    );
    setPhase("dialog_tab_reverse");
    await first.focus();
    await tab.keyboard.press("Shift+Tab");
    confirm(
      await last.evaluate((element) => element === document.activeElement),
    );
  };
  try {
    for (const item of config.cases) {
      const report = {
        ...item,
        error: null,
        keyboardPassed: false,
        engineVersion: null,
        browserVersion: context.browser().version(),
        violations: [],
        incomplete: [],
      };
      errors.length = 0;
      let phase = "navigation";
      try {
        const response = await tab.goto(`${origin}${item.route}`, {
          waitUntil: "domcontentloaded",
        });
        confirm(response?.status() === 200);
        await tab.getByRole("main").waitFor({ state: "visible" });
        await tab
          .getByRole("heading", { level: 1 })
          .first()
          .waitFor({ state: "visible" });
        phase = "font_loading";
        await tab.evaluate(() => document.fonts.ready.then(() => undefined));
        let opener = null,
          dialog = null,
          navigation = null;
        if (item.route === "/" && item.state === "page") {
          phase = "skip_link";
          await tab.keyboard.press("Tab");
          const skip = tab.getByRole("link", { name: "Перейти к содержимому" });
          confirm(
            await skip.evaluate(
              (element) => element === document.activeElement,
            ),
          );
          await tab.keyboard.press("Enter");
          confirm(
            await tab
              .getByRole("main")
              .evaluate((element) => element === document.activeElement),
          );
        }
        if (item.state === "navigation-open") {
          phase = "navigation_menu";
          opener = tab.getByRole("button", {
            name: /^(Открыть|Закрыть) меню$/,
          });
          await opener.press("Enter");
          navigation = tab.getByRole("navigation", {
            name: "Главная навигация",
          });
          await navigation.waitFor({ state: "visible" });
          confirm((await opener.getAttribute("aria-expanded")) === "true");
          phase = "navigation_focus";
          const links = navigation.getByRole("link");
          confirm(
            await links
              .first()
              .evaluate((element) => element === document.activeElement),
          );
          await tab.keyboard.press("Tab");
          confirm(
            await links
              .nth(1)
              .evaluate((element) => element === document.activeElement),
          );
        } else if (item.state === "ege-dialog") {
          phase = "ege_dialog";
          opener = tab.getByRole("button", {
            name: "Подобрать по ЕГЭ",
            exact: true,
          });
          await opener.click();
          dialog = tab.getByRole("dialog", {
            name: "Куда поступать с моими баллами?",
          });
        } else if (item.state === "filters-dialog") {
          phase = "filters_dialog";
          opener = tab.getByRole("button", { name: /^Фильтры/ });
          await opener.click();
          dialog = tab.getByRole("dialog", { name: "Фильтры программ" });
        }
        if (dialog) {
          phase = "dialog_visibility";
          await dialog.waitFor({ state: "visible" });
          let first = null,
            last = null;
          if (item.state === "filters-dialog") {
            confirm((await dialog.getAttribute("aria-modal")) === "true");
            first = dialog.getByRole("button", {
              name: "Закрыть фильтры",
              exact: true,
            });
            last = dialog.getByRole("button", { name: /^Показать \d+$/ });
          }
          await trap(dialog, first, last, (stage) => {
            phase = stage;
          });
        }
        phase = "axe_injection";
        await tab.addScriptTag({ path: config.axePath });
        phase = "axe_scan";
        const result = await tab.evaluate(async () => {
          window.axe.configure({ noHtml: true });
          const results = await window.axe.run(document, {
            runOnly: {
              type: "tag",
              values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
            },
            resultTypes: ["violations", "incomplete"],
            iframes: false,
          });
          const compact = (rules) =>
            rules.map((rule) => ({
              id: rule.id,
              impact: rule.impact,
              help: rule.help,
              helpUrl: rule.helpUrl,
              affectedNodes: rule.nodes.length,
              selectorsTruncated: rule.nodes.length > 20,
              nodes: rule.nodes.slice(0, 20).map((node) => ({
                target: node.target,
                failureSummary: node.failureSummary,
              })),
            }));
          return {
            engineVersion: window.axe.version,
            violations: compact(results.violations),
            incomplete: compact(results.incomplete),
          };
        });
        Object.assign(report, result);
        if (item.route === "/match" || item.state === "filters-dialog") {
          phase = "layout_evidence";
          confirm(
            await tab.evaluate(
              () =>
                document.documentElement.scrollWidth <= window.innerWidth + 1,
            ),
          );
          if (item.route === "/match") {
            await tab
              .locator(".match-decision-main:visible")
              .first()
              .scrollIntoViewIfNeeded();
          }
          await tab.screenshot({
            path: `output/playwright/accessibility-${item.route === "/match" ? "match" : "mobile-filters"}-${item.width}.png`,
          });
        }
        if (opener) {
          phase = "focus_return";
          await tab.keyboard.press("Escape");
          if (dialog) await dialog.waitFor({ state: "hidden" });
          if (navigation) {
            await navigation.waitFor({ state: "hidden" });
            confirm((await opener.getAttribute("aria-expanded")) === "false");
          }
          confirm(
            await opener.evaluate(
              (element) => element === document.activeElement,
            ),
          );
        }
        phase = "runtime_errors";
        confirm(errors.length === 0);
        report.keyboardPassed = true;
      } catch {
        report.error = phase;
      }
      reports.push(report);
    }
  } finally {
    await context.close();
  }
  return reports;
}
