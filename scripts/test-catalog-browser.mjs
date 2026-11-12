import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import checkCatalog from "../tests/catalog-browser.mjs";

const cli = process.env.BROWSER_CLI;
assert.ok(
  cli && existsSync(cli),
  "BROWSER_CLI must name an installed Playwright CLI",
);
const origin = "http://127.0.0.1:3100";
let live = false;
for (let attempt = 0; attempt < 90; attempt++) {
  try {
    const response = await fetch(`${origin}/api/live`, {
      signal: AbortSignal.timeout(2000),
    });
    live = response.ok && (await response.json()).status === "alive";
    if (live) break;
  } catch {}
  await new Promise((done) => setTimeout(done, 500));
}
assert.ok(live, "snapshot preview must be live before browser checks");
mkdirSync("tmp", { recursive: true });
mkdirSync("output/playwright", { recursive: true });
const codeFile = resolve("tmp/catalog-browser-code.js");
writeFileSync(codeFile, `(${checkCatalog.toString()})\n`);
const session = `catalog-ci-${process.pid}`;
const call = (args) =>
  execFileSync(process.execPath, [cli, `-s=${session}`, ...args], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 120_000,
    maxBuffer: 1024 * 1024,
  });
try {
  call(["open", origin, "--browser=chrome"]);
  const result = call(["run-code", `--filename=${codeFile}`]);
  writeFileSync("output/playwright/catalog-browser.log", result);
  const match = result.match(/### Result\r?\n\s*(\[.*?\])(?=\s*###|\s*$)/s);
  assert.ok(match, "Playwright must return a structured result");
  const reports = JSON.parse(match[1]);
  assert.equal(reports.length, 6);
  for (const width of [1440, 390]) {
    for (const route of [
      "/programs/mpei-applied-informatics",
      "/programs/rudn-applied-math",
      "/universities/rudn",
    ]) {
      assert.ok(
        reports.some(
          (report) =>
            report.width === width && report.route === route && report.passed,
        ),
        `${route} at ${width}`,
      );
    }
  }
  const report = {
    revision: process.env.GITHUB_SHA ?? null,
    buildId: readFileSync(".next/BUILD_ID", "utf8").trim(),
    reports,
  };
  writeFileSync(
    "output/playwright/catalog-browser.json",
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify(report));
} finally {
  try {
    call(["close"]);
  } catch {}
}
