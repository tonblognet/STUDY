import assert from "node:assert/strict";
import { test } from "node:test";
import {
  accessibilityCases,
  axeVersion,
  validateAccessibilityReports,
} from "./public-accessibility-contract.mjs";

const complete = () =>
  [1440, 390].flatMap(accessibilityCases).map((item) => ({
    ...item,
    error: null,
    keyboardPassed: true,
    engineVersion: axeVersion,
    violations: [],
    incomplete: [],
  }));
test("audit covers public pages and rendered dialogs at both viewport widths", () => {
  const reports = complete();
  assert.equal(reports.length, 42);
  validateAccessibilityReports(reports);
  reports[0].incomplete.push({ id: "manual-review-required" });
  validateAccessibilityReports(reports);
});
test("partial, duplicated, unexpected and failed browser evidence cannot pass", () => {
  for (const mutate of [
    (rows) => rows.pop(),
    (rows) => {
      rows[1] = { ...rows[0] };
    },
    (rows) => {
      rows[0].route = "/account";
    },
    (rows) => {
      rows[0].error = "script_injection_failed";
    },
    (rows) => {
      rows[0].keyboardPassed = false;
    },
    (rows) => {
      rows[0].engineVersion = "unknown";
    },
    (rows) => {
      rows[0].violations.push({ id: "color-contrast" });
    },
    (rows) => {
      delete rows[0].incomplete;
    },
  ]) {
    const rows = complete();
    mutate(rows);
    assert.throws(() => validateAccessibilityReports(rows));
  }
  assert.throws(() => accessibilityCases(800));
});
