import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { readFileSync } from "node:fs";
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
  const readyDeadline = Date.now() + 60_000;
  let lastReadiness = "No response";
  while (Date.now() < readyDeadline) {
    if (server.exitCode !== null)
      throw new Error(
        `Production server exited before readiness: ${server.exitCode}`,
      );
    try {
      const response = await fetch(base, {
        signal: AbortSignal.timeout(
          Math.max(1, Math.min(30_000, readyDeadline - Date.now())),
        ),
      });
      lastReadiness = `HTTP ${response.status}`;
      await response.body?.cancel();
      if (response.ok) return;
    } catch (error) {
      lastReadiness = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `Production server did not become ready within 60s: ${lastReadiness}`,
  );
});

after(() => {
  server?.kill();
});

test("public journeys have one main landmark and a keyboard skip link", async () => {
  for (const route of [
    "/programs",
    "/universities",
    "/universities/mgu",
    "/programs/hse-economics",
    "/match",
    "/compare",
  ]) {
    const response = await fetch(`${base}${route}`);
    assert.equal(response.status, 200, route);
    const html = await response.text();
    assert.equal((html.match(/<main(?:\s|>)/g) ?? []).length, 1, route);
    assert.match(html, /id="main-content"/);
    assert.match(html, /href="#main-content"/);
  }
});

test("shared filters are applied before hydration and invalid URLs recover", async () => {
  for (const [route, filters] of [
    ["/programs", { query: "no-such-program-xyz" }],
    ["/universities", { query: "no-such-university-xyz" }],
  ]) {
    const html = await (
      await fetch(
        `${base}${route}?filters=${encodeURIComponent(JSON.stringify(filters))}`,
      )
    ).text();
    assert.match(
      html,
      route === "/programs"
        ? /Подходящих программ не найдено/
        : /Вуз не найден/,
    );
    assert.match(html, /value="no-such-/);
  }
  const invalid = await (await fetch(`${base}/programs?filters=null`)).text();
  assert.match(invalid, /Найдено <!-- -->185/);
});

test("university profiles render admissions links and distinct commission contacts", async () => {
  const response = await fetch(`${base}/universities/inpsycho`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Телефон приёмной комиссии/);
  assert.match(html, /zayavka@inpsycho\.ru/);
  assert.match(html, /href="https:\/\/inpsycho\.ru\/abitur\/"/);
  assert.match(html, /Открыть раздел для поступающих/);
  assert.match(html, /STEM|Московский институт психоанализа/);
});

test("nationwide directory filters a city and keeps historical records separate from intake", async () => {
  const { universities } = JSON.parse(
    readFileSync("data-sources/russia/universities.json", "utf8"),
  );
  const sample = universities.find((row) => row.city === "Казань");
  assert.ok(sample, "reviewed Kazan directory entry");
  const filters = encodeURIComponent(JSON.stringify({ city: "Казань" }));
  const html = await (
    await fetch(`${base}/universities?filters=${filters}`)
  ).text();
  assert.match(html, /Вузы России/);
  assert.match(html, /value="Казань" selected=""/);
  assert.match(html, new RegExp(`/universities/${sample.slug}`));
  const profile = await (
    await fetch(`${base}/universities/${sample.slug}`)
  ).text();
  assert.match(profile, /Период источника: <!-- -->2025/);
  assert.match(profile, /Программы ещё не добавлены/);
  assert.match(profile, /Нет подтверждённых данных/);
  assert.match(profile, /monitoring\.miccedu\.ru/);
});

test("reviewed faculty names expose the exact source without claiming admission", async () => {
  const html = await (await fetch(`${base}/universities/mgu`)).text();
  assert.match(html, /id="faculties"/);
  assert.match(html, /Факультеты и институты/);
  assert.match(html, /Поиск по факультетам и институтам/);
  assert.match(
    html,
    /Показать ещё(?:<!-- -->|\s)+12(?:<!-- -->|\s)+подразделений/,
  );
  assert.match(html, /Механико-математический факультет/);
  assert.match(html, /наличие подразделения не подтверждает набор/);
});

test("matching renders separate eligibility, strict filters and program-specific exams", async () => {
  const response = await fetch(`${base}/match`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Минимумы испытаний выполнены/);
  assert.match(html, /Аккредитация программы/);
  assert.match(html, /Подтверждённые платные/);
  assert.match(html, /Дополнительные испытания/);
  assert.match(html, /Добавить в сравнение/);
  const details = await (await fetch(`${base}/programs/hse-economics`)).text();
  assert.match(details, /Требования нужно уточнить/);
  assert.match(details, /Сравнение недоступно/);
  assert.match(details, /шкала проходного балла/);
});

test("server-renders the new admissions landing", async () => {
  const response = await fetch(base);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Поступление начинается с ясного выбора/);
  assert.match(html, /Спокойно сравните всё важное/);
  assert.match(html, /официальные источники/i);
  assert.match(html, /справочник вузов России/);
  assert.match(html, /role="group"/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /aria-label="Бюджетные места по программам"/);
  assert.match(html, /href="\/match"[^>]*>Подобрать варианты/);
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
  assert.equal((html.match(/class="mgu-program"/g) ?? []).length, 12);
  assert.match(html, /Показать ещё программы/);
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
  assert.match(profileHtml, /Направления из официального перечня/);
  assert.match(profileHtml, /Эти записи пока не участвуют в подборе по ЕГЭ/);
  assert.match(profileHtml, /monitoring\.miccedu\.ru/);
  assert.match(profileHtml, /Источник символики/);
  assert.doesNotMatch(profileHtml, /Полностью проверено/);
  const unknown = await (await fetch(`${base}/universities/avr`)).text();
  assert.match(unknown, /Программы ещё не добавлены/);
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

test("university listings show a dated source and keep unknown intake years explicit", async () => {
  const [mephi, omsk] = await Promise.all([
    fetch(`${base}/universities/mephi`),
    fetch(`${base}/universities/russia-1638`),
  ]);
  assert.equal(mephi.status, 200);
  assert.equal(omsk.status, 200);
  assert.match(await mephi.text(), /Перечень за 2026 год/);
  const omskHtml = await omsk.text();
  assert.match(omskHtml, /Год набора не подтверждён/);
  assert.match(omskHtml, /omgau\.ru\/sveden\/education\/eduaccred/);
  assert.match(omskHtml, /65-53-44/);
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

test("privacy describes guest storage, server accounts and current delivery limits", async () => {
  const response = await fetch(`${base}/privacy`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Без входа избранные программы, сравнение и наборы ЕГЭ/);
  assert.match(html, /локально в браузере/);
  assert.match(html, /После входа избранное, сравнение и наборы ЕГЭ/);
  assert.match(html, /базе данных PostgreSQL/);
  assert.match(html, /хеш bcrypt/);
  assert.match(html, /cookie с токеном сессии/);
  assert.match(html, /в базе хранится только хеш этого токена/);
  assert.match(html, /передаются почтовому провайдеру/);
  assert.match(html, /Email-рассылка дедлайнов не подключена/);
  assert.match(
    html,
    /Самостоятельное удаление аккаунта и выгрузка всех его данных пока/,
  );
  assert.match(html, /До публичного запуска нужны юридическая проверка/);
  assert.doesNotMatch(html, /не принимает и не хранит пользовательские пароли/);
  assert.doesNotMatch(html, /получает от платформы идентификатор/);
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
