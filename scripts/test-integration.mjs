import { spawnSync } from "node:child_process";
for (const args of [
  ["--test", "tests/rendered-html.test.mjs"],
  ["--import", "tsx", "--test", "tests/catalog-db.test.ts"],
]) {
  const result = spawnSync(process.execPath, args, {
    stdio: "inherit",
    windowsHide: true,
    env: { ...process.env, CATALOG_HTTP_TESTS: "true" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
