import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { join } from "node:path";
import test, { after, before } from "node:test";

const port = 3217;
const base = `http://127.0.0.1:${port}`;
let server;

before(async () => {
  server = spawn(
    process.execPath,
    [
      join(process.cwd(), "node_modules/next/dist/bin/next"),
      "start",
      "-p",
      String(port),
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "production",
        CATALOG_STORAGE: "snapshot",
      },
      windowsHide: true,
      stdio: "ignore",
    },
  );
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (server.exitCode !== null)
      throw new Error("Production server exited before readiness");
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

test("MGU page exposes sourced contest groups, archive and opt-in map", async () => {
  const response = await fetch(`${base}/universities/mgu`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Найдите своё направление/);
  assert.match(html, /2011–2025/);
  assert.match(html, /kcp_bak.pdf/);
  assert.match(html, /Год поступления/);
  assert.match(html, /Загрузить карту/);
  assert.match(html, /Ленинские горы/);
  assert.match(
    response.headers.get("content-security-policy"),
    /frame-src https:\/\/yandex.ru/,
  );
  assert.doesNotMatch(html, /<iframe/);
});

test("university directory exposes search, ownership and university-only profiles", async () => {
  const catalog = await fetch(`${base}/universities`);
  assert.equal(catalog.status, 200);
  const html = await catalog.text();
  assert.match(html, /Найти вуз/);
  assert.match(html, /Негосударственные/);
  assert.match(html, /Сведения в карточке/);
  assert.match(html, /Есть общие контакты/);
  assert.match(html, /Текущий статус лицензии не подтверждён/);
  assert.match(html, /Показать ещё/);
  const profile = await fetch(`${base}/universities/rosnou`);
  assert.equal(profile.status, 200);
  const profileHtml = await profile.text();
  assert.match(profileHtml, /Негосударственный вуз/);
  assert.match(profileHtml, /Программы ещё не добавлены/);
  assert.match(profileHtml, /monitoring\.miccedu\.ru/);
  assert.match(profileHtml, /Источник символики/);
  assert.doesNotMatch(profileHtml, /Полностью проверено/);
});

test("MGU program retains mixed-scale history without a misleading chart", async () => {
  const response = await fetch(`${base}/programs/mgu-economics`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Шкалы и состав испытаний менялись/);
  assert.match(html, /mgu-point-history/);
  assert.match(html, /Приёмная комиссия факультета/);
  assert.match(html, /Математика.*минимум/s);
  assert.match(html, /minimum.pdf/);
  assert.match(html, /Минимум ДВИ/);
  assert.match(html, /2026BachTuition/);
});

test("university evidence separates license dates and education lists from admissions", async () => {
  const response = await fetch(`${base}/universities/mgusit`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Л035-00115-77\/00096755/);
  assert.match(html, /02\.09\.2025/);
  assert.match(
    html,
    /Актуальный статус в реестре Рособрнадзора не подтверждён/,
  );
  assert.match(html, /Направления из официального перечня/);
  assert.match(html, /Поиск по направлениям/);
  assert.match(html, /пока не участвуют в подборе по ЕГЭ/);
  assert.match(html, /mgusit@mossport.ru/);
  assert.match(
    html,
    /Проверка контактов и адреса не подтверждает текущую лицензию или набор/,
  );
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

test("creative admission campaign preserves shared places and separate exams", async () => {
  const response = await fetch(`${base}/universities/balletacademy`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Условия приёма/);
  assert.match(html, /Места общие для перечисленных профилей/);
  assert.match(html, /260\s*000/);
  assert.match(html, /4 года 9 месяцев/);
  assert.match(html, /3 года/);
  assert.match(html, /не участвуют в автоматическом подборе по ЕГЭ/);
  assert.match(html, /Минимальные баллы и сроки основного приёма/);
  assert.doesNotMatch(html, /Программы ещё не добавлены/);
});

test("persistent user state requires authentication", async () => {
  const response = await fetch(`${base}/api/user-state`);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "authentication_required" });
});
