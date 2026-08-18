import assert from "node:assert/strict";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) }, DB: undefined }, { waitUntil() {}, passThroughOnException() {} });
}

async function request(path, init = {}) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request(`http://localhost${path}`, init), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) }, DB: undefined }, { waitUntil() {}, passThroughOnException() {} });
}

test("server-renders trust-first home", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Поступай/);
  assert.match(html, /Проверьте, что сдавать/);
  assert.match(html, /официальные источники/);
  assert.doesNotMatch(html, /codex-preview/);
});

test("server-renders trusted catalog", async () => {
  const response = await render("/programs");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Каталог программ/);
  assert.match(html, /Экономика/);
  assert.match(html, /Годы различаются/);
});

test("legacy password login cannot create a demo session", async () => {
  const response = await request("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "demo@postupai.ru", password: "Demo2026!" }) });
  assert.equal(response.status, 410);
  assert.equal(response.headers.get("set-cookie"), null);
});

test("checkout requires a server-authenticated user", async () => {
  const response = await request("/api/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ planCode: "season" }) });
  assert.equal(response.status, 401);
  const payload = await response.json();
  assert.match(payload.error, /войдите/i);
});

test("persistent user state requires a server-authenticated user", async () => {
  const response = await request("/api/user-state");
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "authentication_required" });
});
