import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test, { after, before } from "node:test";

const port = 3217;
const base = `http://127.0.0.1:${port}`;
let server;

before(async () => {
  server = spawn(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    ["start", "-p", String(port)],
    {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: "production" },
      stdio: "ignore",
      shell: process.platform === "win32",
    },
  );
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(base);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Production server did not become ready");
});

after(() => {
  server?.kill();
});

test("server-renders the new admissions landing", async () => {
  const response = await fetch(base);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Поступление начинается с ясного выбора/);
  assert.match(html, /Спокойно сравните всё важное/);
  assert.match(html, /официальные источники/i);
  assert.doesNotMatch(html, /codex-preview/);
});

test("server-renders the filterable program catalog", async () => {
  const response = await fetch(`${base}/programs`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Программы московских вузов/);
  assert.match(html, /Название программы, направление или вуз/);
  assert.match(html, /Бюджетные места/);
});

test("auth mutations reject cross-origin requests before touching persistence", async () => {
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://evil.example",
    },
    body: JSON.stringify({
      email: "user@example.ru",
      password: "ReliablePass2027",
    }),
  });
  assert.equal(response.status, 403);
  assert.equal(response.headers.get("set-cookie"), null);
});

test("persistent user state requires authentication", async () => {
  const response = await fetch(`${base}/api/user-state`);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "authentication_required" });
});
