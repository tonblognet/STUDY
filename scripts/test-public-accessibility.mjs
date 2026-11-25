import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import checkAccessibility from "../tests/public-accessibility.mjs";
import {
  accessibilityCases,
  axeVersion,
  validateAccessibilityReports,
} from "./public-accessibility-contract.mjs";

const cli = process.env.BROWSER_CLI;
assert.ok(cli && existsSync(cli), "BROWSER_CLI must name an installed CLI");
const axePath = resolve(process.env.AXE_CORE_PATH ?? "");
assert.ok(
  axePath.replaceAll("\\", "/").endsWith("/node_modules/axe-core/axe.min.js") &&
    existsSync(axePath),
  "AXE_CORE_PATH must name the installed axe engine",
);
assert.equal(
  JSON.parse(readFileSync(resolve(dirname(axePath), "package.json"), "utf8"))
    .version,
  axeVersion,
);
assert.equal(
  process.env.CATALOG_STORAGE,
  "snapshot",
  "Only snapshot preview is audited",
);
const origin = "http://127.0.0.1:3100";
const ready = await fetch(`${origin}/api/ready`, {
  redirect: "manual",
  signal: AbortSignal.timeout(5000),
});
assert.equal(
  ready.status,
  503,
  "Snapshot audit must refuse a ready deployment",
);
assert.equal((await ready.json()).status, "not_ready");
mkdirSync("tmp", { recursive: true });
mkdirSync("output/playwright", { recursive: true });
const reports = [];
const session = `public-a11y-${process.pid}`;
const call = (args) =>
  execFileSync(process.execPath, [cli, `-s=${session}`, ...args], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 300_000,
    maxBuffer: 8 * 1024 * 1024,
  });
try {
  call(["open", origin, "--browser=chrome"]);
  for (const width of [1440, 390]) {
    const config = { axePath, width, cases: accessibilityCases(width) };
    const codeFile = resolve(`tmp/public-accessibility-${width}.js`);
    writeFileSync(
      codeFile,
      `async (page) => (${checkAccessibility.toString()})(page, ${JSON.stringify(config)})\n`,
    );
    let output;
    try {
      output = call(["run-code", `--filename=${codeFile}`]);
    } catch (error) {
      writeFileSync(
        `output/playwright/public-accessibility-${width}.log`,
        String(error.stdout ?? "").slice(0, 8 * 1024 * 1024),
      );
      throw new Error(
        "Accessibility CLI failed; inspect the retained artifact",
      );
    }
    writeFileSync(
      `output/playwright/public-accessibility-${width}.log`,
      output,
    );
    const match = output.match(/### Result\r?\n\s*(\[.*?\])(?=\s*###|\s*$)/s);
    assert.ok(match, "Accessibility browser result is missing");
    const rows = JSON.parse(match[1]);
    assert.ok(Array.isArray(rows));
    reports.push(...rows);
    writeFileSync(
      "output/playwright/public-accessibility.json",
      `${JSON.stringify(
        {
          revision: process.env.GITHUB_SHA ?? null,
          buildId: readFileSync(".next/BUILD_ID", "utf8").trim(),
          axeVersion,
          checkedAt: new Date().toISOString(),
          scope: "snapshot_public_pages_and_dialogs",
          reports,
        },
        null,
        2,
      )}\n`,
    );
  }
  console.log(
    JSON.stringify({
      cases: reports.length,
      violations: reports.reduce(
        (sum, item) => sum + item.violations.length,
        0,
      ),
      incomplete: reports.reduce(
        (sum, item) => sum + item.incomplete.length,
        0,
      ),
      browserErrors: reports.filter((item) => item.error).length,
    }),
  );
  validateAccessibilityReports(reports);
} finally {
  try {
    call(["close"]);
  } catch {}
}
