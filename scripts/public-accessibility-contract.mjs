import assert from "node:assert/strict";

export const axeVersion = "4.14.0";
export const publicRoutes = [
  "/",
  "/programs",
  "/universities",
  "/programs/mpei-applied-informatics",
  "/programs/rudn-applied-math",
  "/universities/rudn",
  "/match",
  "/compare",
  "/methodology",
  "/faq",
  "/pricing",
  "/support",
  "/privacy",
  "/about",
  "/login",
  "/register",
  "/forgot-password",
  "/verify-email",
  "/reset-password",
];

export function accessibilityCases(width) {
  assert.ok([1440, 390].includes(width), "Unsupported audit viewport");
  return publicRoutes.flatMap((route) => {
    const states = ["page"];
    if (route === "/programs") states.push("ege-dialog");
    if (width === 390 && route === "/programs") states.push("filters-dialog");
    if (width === 390 && route === "/") states.push("navigation-open");
    return states.map((state) => ({ route, state, width }));
  });
}

export function validateAccessibilityReports(reports) {
  assert.ok(Array.isArray(reports), "Audit must return an array");
  const expected = [1440, 390].flatMap(accessibilityCases);
  assert.equal(reports.length, expected.length, "Incomplete audit matrix");
  const key = ({ route, state, width }) => `${width}:${route}:${state}`;
  const seen = new Set();
  for (const report of reports) {
    const identity = key(report);
    assert.ok(
      expected.some((item) => key(item) === identity),
      "Unknown audit case",
    );
    assert.ok(!seen.has(identity), "Duplicate audit case");
    seen.add(identity);
    assert.equal(report.error, null, `${identity}: browser execution failed`);
    assert.equal(report.engineVersion, axeVersion, "Unexpected axe engine");
    assert.ok(Array.isArray(report.violations), "Missing violation results");
    assert.ok(
      Array.isArray(report.incomplete),
      "Missing manual-review results",
    );
    assert.equal(
      report.keyboardPassed,
      true,
      `${identity}: keyboard check failed`,
    );
    assert.equal(
      report.violations.length,
      0,
      `${identity}: accessibility violations`,
    );
  }
}
