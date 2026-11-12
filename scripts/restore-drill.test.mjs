import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { parseRestoreTarget } from "./restore-drill.mjs";

test("local restore accepts only the explicit dedicated database contract", () => {
  const result = parseRestoreTarget(
    "postgresql://restore_user:fixture%21@127.0.0.1:55432/restore_test?schema=public",
  );
  assert.equal(result.database, "restore_test");
  assert.equal(result.url.port, "55432");
  assert.equal(result.username, "restore_user");
  assert.equal(result.password, "fixture!");
});

test("restore target refuses production, remote and alternate connection options", () => {
  for (const target of [
    undefined,
    "postgresql://role:secret@127.0.0.1:5432/prod",
    "postgresql://role:secret@10.0.0.1:5432/restore_test",
    "postgresql://role:secret@localhost:5432/restore_test",
    "postgresql://role:secret@127.0.0.1/restore_test",
    "postgresql://role:secret@127.0.0.1:5432/restore_test?schema=other",
    "postgresql://role:secret@127.0.0.1:5432/restore_test?schema=public&schema=public",
    "postgresql://role:secret@127.0.0.1:5432/restore_test?host=prod",
    "postgresql://role:secret@127.0.0.1:5432/%72estore_test",
    "postgresql://role:%00secret@127.0.0.1:5432/restore_test",
  ]) {
    assert.throws(
      () => parseRestoreTarget(target),
      (error) => {
        assert.match(error.message, /dedicated local 127\.0\.0\.1/);
        assert.doesNotMatch(error.message, /secret/);
        return true;
      },
    );
  }
});

test("CLI ignores DATABASE_URL as a fallback and prints a credential-free error", () => {
  const env = {
    ...process.env,
    TEST_DATABASE_URL: "",
    DATABASE_URL:
      "postgresql://role:private-secret@production.example:5432/prod",
  };
  const result = spawnSync(process.execPath, ["scripts/restore-drill.mjs"], {
    encoding: "utf8",
    env,
    windowsHide: true,
    timeout: 5000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Restore drill failed: TEST_DATABASE_URL/);
  assert.doesNotMatch(
    `${result.stdout}${result.stderr}`,
    /private-secret|production\.example/,
  );
});
