import { spawnSync } from "node:child_process";
for (const args of [
  ["--test", "tests/rendered-html.test.mjs"],
  ["--test", "tests/account-migration.test.mjs"],
  ["--import", "tsx", "--test", "tests/catalog-db.test.ts"],
  ["--import", "tsx", "--test", "tests/account-db.test.ts"],
]) {
  const result = spawnSync(process.execPath, args, {
    stdio: "inherit",
    windowsHide: true,
    env: { ...process.env, CATALOG_HTTP_TESTS: "true" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
