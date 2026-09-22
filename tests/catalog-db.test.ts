import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createOpaqueToken } from "../lib/auth/crypto";
import { PrismaClient } from "@prisma/client";
import { baselineCatalog } from "../lib/catalog/baseline";
import {
  stageCatalog,
  reviewCatalog,
  readPublishedCatalog,
} from "../lib/catalog/service";
import { catalogChecksum } from "../lib/catalog/diff";

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl)
  throw new Error(
    "TEST_DATABASE_URL is required; use a dedicated database ending in _test",
  );
const url = new URL(testUrl);
if (!url.pathname.endsWith("_test"))
  throw new Error("Refusing to run against a database not ending in _test");
const schema = `catalog_test_${randomUUID().replaceAll("-", "")}`;
url.searchParams.set("schema", schema);
const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
const admin = { id: "catalog-editor-test", role: "ADMIN" as const };
const initial = baselineCatalog();
let first: string;
let published: string;
let server: ChildProcess | undefined;
const base = "http://localhost:3218";
let editorCookie: string;
let userCookie: string;
const options = (base: string | null) => ({
  actor: admin,
  reason: "Изолированный интеграционный тест",
  expectedRevisionId: base,
});

before(async () => {
  execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    {
      env: { ...process.env, DATABASE_URL: url.toString() },
      stdio: "pipe",
      windowsHide: true,
    },
  );
  await db.user.create({
    data: {
      id: admin.id,
      email: "catalog-editor@example.invalid",
      role: "ADMIN",
    },
  });
  await db.user.create({
    data: {
      id: "catalog-applicant-test",
      email: "catalog-applicant@example.invalid",
      role: "USER",
    },
  });
  for (const id of [admin.id, "catalog-applicant-test"]) {
    const { token, tokenHash } = createOpaqueToken();
    await db.session.create({
      data: {
        userId: id,
        tokenHash,
        expires: new Date(Date.now() + 60_000 * 20),
      },
    });
    if (id === admin.id) editorCookie = `postupai_session=${token}`;
    else userCookie = `postupai_session=${token}`;
  }
  if (process.env.CATALOG_HTTP_TESTS === "true") {
    server = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "start",
        "-p",
        "3218",
        "-H",
        "127.0.0.1",
      ],
      {
        env: {
          ...process.env,
          NODE_ENV: "production",
          DATABASE_URL: url.toString(),
          CATALOG_STORAGE: "database",
          APP_URL: base,
        },
        windowsHide: true,
        stdio: "ignore",
      },
    );
    let ready = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      if (server.exitCode !== null)
        throw new Error("Production catalog test server exited");
      try {
        if ((await fetch(`${base}/api/health`)).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.equal(ready, true, "production catalog server readiness");
  }
});
after(async () => {
  if (server && server.exitCode === null) {
    const stopped = new Promise((resolve) => server!.once("exit", resolve));
    server.kill();
    await stopped;
  }
  // The name is generated above, never taken from user configuration.
  await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await db.$disconnect();
});

describe("PostgreSQL editorial publication", { concurrency: false }, () => {
  it("deduplicates concurrent imports and keeps drafts invisible", async () => {
    const [a, b] = await Promise.all([
      stageCatalog(db, initial, options(null)),
      stageCatalog(db, initial, options(null)),
    ]);
    assert.equal(a.id, b.id);
    first = a.id;
    assert.equal(await db.catalogRevision.count(), 1);
    assert.equal(await db.educationProgram.count(), 0);
    await assert.rejects(readPublishedCatalog(db), /не опубликован/);
  });
  it("publishes once across concurrent confirmations and updates public and relational views", async () => {
    await Promise.all([
      reviewCatalog(db, first, "publish", options(null)),
      reviewCatalog(db, first, "publish", options(null)),
    ]);
    const current = await readPublishedCatalog(db);
    published = current.revisionId;
    assert.equal(current.snapshot.programs[0].title, initial.programs[0].title);
    assert.equal(await db.educationProgram.count(), initial.programs.length);
    assert.equal(
      await db.auditLog.count({ where: { action: "CATALOG_PUBLISHED" } }),
      1,
    );
    const repeat = await stageCatalog(db, initial, options(published));
    assert.equal(repeat.id, first);
    assert.equal(repeat.unchanged, true);
  });
  it("publishes a source-only change and rejects a competing stale draft", async () => {
    const a = structuredClone(initial),
      b = structuredClone(initial);
    a.programs[0].tuitionValue.note =
      "Источник повторно сопоставлен с профилем";
    b.programs[0].tuitionValue.note = "Другая редакторская проверка";
    const draftA = await stageCatalog(db, a, options(published));
    const draftB = await stageCatalog(db, b, options(published));
    await reviewCatalog(db, draftA.id, "publish", options(published));
    await assert.rejects(
      reviewCatalog(db, draftB.id, "publish", options(published)),
      /старой версии/,
    );
    published = draftA.id;
    assert.equal(
      (await readPublishedCatalog(db)).snapshot.programs[0].tuitionValue.note,
      a.programs[0].tuitionValue.note,
    );
    await reviewCatalog(db, draftB.id, "reject", options(published));
    assert.equal(
      (await db.catalogRevision.findUniqueOrThrow({ where: { id: draftB.id } }))
        .status,
      "REJECTED",
    );
  });
  it("rolls back every relational write and head change if audit persistence fails", async () => {
    const before = await readPublishedCatalog(db),
      candidate = structuredClone(before.snapshot);
    candidate.programs[0].title += " — transaction test";
    const draft = await stageCatalog(db, candidate, options(published));
    const originalRow = await db.educationProgram.findFirstOrThrow();
    await assert.rejects(
      reviewCatalog(db, draft.id, "publish", {
        actor: { id: "nonexistent-actor", role: "ADMIN" },
        reason: "Проверка отката транзакции",
      }),
    );
    assert.equal((await readPublishedCatalog(db)).revisionId, published);
    assert.equal(
      (await db.educationProgram.findFirstOrThrow()).name,
      originalRow.name,
    );
    assert.equal(
      (await db.catalogRevision.findUniqueOrThrow({ where: { id: draft.id } }))
        .status,
      "REVIEW",
    );
  });
  it("prevents mutation of published evidence even through SQL", async () => {
    await assert.rejects(
      db.catalogRevision.update({
        where: { id: published },
        data: { checksum: "tampered" },
      }),
      /immutable/,
    );
    const current = await readPublishedCatalog(db);
    const revision = await db.catalogRevision.findUniqueOrThrow({
      where: { id: published },
    });
    assert.equal(catalogChecksum(current.snapshot), revision.checksum);
  });
  it("denies unauthorized writers before creating records", async () => {
    const count = await db.catalogRevision.count();
    await assert.rejects(
      stageCatalog(db, initial, {
        ...options(published),
        actor: { id: admin.id, role: "USER" },
      }),
      /прав/,
    );
    await assert.rejects(
      reviewCatalog(db, published, "publish", {
        actor: { id: admin.id, role: "SUPPORT" },
        reason: "Несанкционированное действие",
      }),
      /прав/,
    );
    assert.equal(await db.catalogRevision.count(), count);
  });
  it("rejects reassigned public identities before creating a review", async () => {
    const current = await readPublishedCatalog(db);
    const count = await db.catalogRevision.count();
    for (const field of ["id", "slug"] as const) {
      const candidate = structuredClone(current.snapshot);
      candidate.programs[0][field] += "-changed";
      await assert.rejects(
        stageCatalog(db, candidate, options(published)),
        /идентичность/,
      );
    }
    assert.equal(await db.catalogRevision.count(), count);
    assert.equal((await readPublishedCatalog(db)).revisionId, published);
    const legacy = structuredClone(current.snapshot);
    legacy.programs[0].id += "-legacy";
    const legacyDraft = await db.catalogRevision.create({
      data: {
        fingerprint: randomUUID(),
        checksum: catalogChecksum(legacy),
        baseRevisionId: published,
        payload: JSON.parse(JSON.stringify(legacy)),
        changes: [],
        reason: "Черновик до проверки идентификаторов",
        createdBy: admin.id,
      },
    });
    await assert.rejects(
      reviewCatalog(db, legacyDraft.id, "publish", options(published)),
      /идентичность/,
    );
    assert.equal((await readPublishedCatalog(db)).revisionId, published);
    assert.equal(
      (
        await db.catalogRevision.findUniqueOrThrow({
          where: { id: legacyDraft.id },
        })
      ).status,
      "REVIEW",
    );
  });
  it("restores a removed program without breaking saved references and reserves its identity", async () => {
    const before = await readPublishedCatalog(db);
    const program = before.snapshot.programs[0];
    const row = await db.educationProgram.findUniqueOrThrow({
      where: { slug: program.slug },
    });
    const favorite = await db.favorite.create({
      data: { userId: admin.id, programId: row.id },
    });
    const savedState = {
      favoriteIds: [program.id],
      comparisonIds: [program.id],
      scoreSets: [],
    };
    await db.userStateSnapshot.create({
      data: { userId: admin.id, state: savedState },
    });
    const removed = structuredClone(before.snapshot);
    removed.programs = removed.programs.filter(
      (item) => item.slug !== program.slug,
    );
    const draft = await stageCatalog(db, removed, options(published));
    await reviewCatalog(db, draft.id, "publish", options(published));
    published = draft.id;
    assert.equal(
      (await db.educationProgram.findUniqueOrThrow({ where: { id: row.id } }))
        .status,
      "DRAFT",
    );
    for (const field of ["id", "slug"] as const) {
      const reassigned = structuredClone(before.snapshot);
      reassigned.programs[0][field] += "-reused";
      await assert.rejects(
        stageCatalog(db, reassigned, options(published)),
        /идентичность/,
      );
    }
    const restore = await stageCatalog(db, before.snapshot, options(published));
    await reviewCatalog(db, restore.id, "publish", options(published));
    published = restore.id;
    assert.equal(
      (
        await db.educationProgram.findUniqueOrThrow({
          where: { slug: program.slug },
        })
      ).id,
      row.id,
    );
    assert.equal(
      (await db.favorite.findUniqueOrThrow({ where: { id: favorite.id } }))
        .programId,
      row.id,
    );
    assert.deepEqual(
      (
        await db.userStateSnapshot.findUniqueOrThrow({
          where: { userId: admin.id },
        })
      ).state,
      savedState,
    );
    assert.equal(
      catalogChecksum((await readPublishedCatalog(db)).snapshot),
      catalogChecksum(before.snapshot),
    );
  });
  it(
    "routes enforce role, origin and bounded request bodies",
    { skip: process.env.CATALOG_HTTP_TESTS !== "true" },
    async () => {
      const endpoint = `${base}/api/admin/catalog/${published}`;
      for (const cookie of ["", userCookie]) {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { origin: base, cookie, "content-type": "application/json" },
          body: JSON.stringify({
            decision: "publish",
            reason: "Проверка границы доступа",
          }),
        });
        assert.equal(response.status, 403);
      }
      const crossOrigin = await fetch(endpoint, {
        method: "POST",
        headers: { origin: "https://evil.example", cookie: editorCookie },
        body: "{}",
      });
      assert.equal(crossOrigin.status, 403);
      const oversized = await fetch(endpoint, {
        method: "POST",
        headers: { origin: base, cookie: editorCookie },
        body: "x".repeat(33_000),
      });
      assert.equal(oversized.status, 413);
    },
  );
  it(
    "editor correction stays private until HTTP approval, then updates SSR, API, comparison and matching",
    { skip: process.env.CATALOG_HTTP_TESTS !== "true" },
    async () => {
      const current = await readPublishedCatalog(db),
        program = current.snapshot.programs[0];
      const note = `Официальный источник повторно сопоставлен: ${randomUUID()}`;
      const fact = {
        ...program.tuitionValue,
        note,
        sourceKind: "pdf",
        sourceSection: "Строка программы Экономика",
      };
      const headers = {
        origin: base,
        cookie: editorCookie,
        "content-type": "application/json",
      };
      const submitted = await fetch(
        `${base}/api/admin/programs/${program.slug}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            baseRevisionId: current.revisionId,
            field: "tuition",
            fact,
            reason: "Повторная редакторская сверка источника",
          }),
        },
      );
      assert.equal(submitted.status, 202, await submitted.clone().text());
      const draft = (await submitted.json()).revision;
      assert.doesNotMatch(
        await (await fetch(`${base}/programs/${program.slug}`)).text(),
        new RegExp(note),
      );
      const approved = await fetch(`${base}/api/admin/catalog/${draft.id}`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          decision: "publish",
          reason: "Подтверждена привязка источника к программе",
        }),
      });
      assert.equal(approved.status, 200, await approved.clone().text());
      published = draft.id;
      for (const path of [
        `/programs/${program.slug}`,
        "/programs",
        "/compare",
        "/match",
        "/api/programs",
      ]) {
        const response = await fetch(base + path);
        assert.equal(response.status, 200, path);
        assert.ok(
          (await response.text()).includes(note),
          `${path} must read the new published version`,
        );
      }
      const repeat = await fetch(`${base}/api/admin/programs/${program.slug}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          baseRevisionId: current.revisionId,
          field: "tuition",
          fact,
          reason: "Попытка сохранить устаревшую форму",
        }),
      });
      assert.equal(repeat.status, 409);
    },
  );
});
