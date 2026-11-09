import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { PrismaClient, type Prisma } from "@prisma/client";
import { smtpInbox } from "./smtp-inbox";
import { createOpaqueToken, hashPassword, hashToken } from "../lib/auth/crypto";
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !new URL(testUrl).pathname.endsWith("_test"))
  throw new Error("Dedicated TEST_DATABASE_URL ending in _test required");
const url = new URL(testUrl);
const schema = `account_test_${randomUUID().replaceAll("-", "")}`;
url.searchParams.set("schema", schema);
process.env.DATABASE_URL = url.toString();
process.env.AUTH_SECRET =
  "local-integration-test-secret-at-least-32-characters";
process.env.SMTP_URL = "smtp://127.0.0.1:1026";
const base = "http://localhost:3219";
process.env.APP_URL = base;
const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
const inbox = smtpInbox(1026);
let server: ChildProcess | undefined;
let cookieA: string, cookieB: string, userA: string, userB: string;
const password = "ReliablePassword2027";
const headers = (cookie?: string) => ({
  ...(cookie ? { "x-account-id": cookie === cookieA ? userA : userB } : {}),
  origin: base,
  "content-type": "application/json",
  ...(cookie ? { cookie } : {}),
});
const api = (path: string, method = "GET", body?: unknown, cookie?: string) =>
  fetch(`${base}${path}`, {
    method,
    headers: headers(cookie),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const lastToken = () => {
  const text = inbox.messages.at(-1)!;
  const token = text.match(/token=([\w-]+)/)?.[1];
  assert.ok(token, `token in test email: ${text}`);
  return token;
};
const lastCode = () => {
  const code = inbox.messages.at(-1)!.match(/\b\d{6}\b/)?.[0];
  assert.ok(code);
  return code;
};
async function waitForEvidence(
  check: () => boolean | Promise<boolean>,
  message: string,
) {
  const deadline = Date.now() + 8000;
  do {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  } while (Date.now() < deadline);
  assert.fail(message);
}
async function waitForMail(previousCount: number) {
  await waitForEvidence(
    () => inbox.messages.length > previousCount,
    "Expected loopback email was not received",
  );
}
async function blockedBy(pid: number) {
  const [{ blocked }] = await db.$queryRaw<{ blocked: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM pg_stat_activity
      WHERE datname = current_database() AND ${pid} = ANY(pg_blocking_pids(pid))
    ) AS blocked`;
  return blocked;
}
const personalRoutes = [
  ["/api/user-state", "GET"],
  ["/api/user-state", "PUT"],
  ["/api/tracker", "GET"],
  ["/api/tracker", "POST"],
  ["/api/tracker", "PATCH"],
  ["/api/tracker", "DELETE"],
  ["/api/tracker/import", "POST"],
  ["/api/account/security", "GET"],
  ["/api/account/security", "POST"],
  ["/api/account/security", "PATCH"],
  ["/api/account/notifications", "GET"],
  ["/api/account/notifications", "PATCH"],
  ["/api/auth/logout-all", "POST"],
] as const;
async function assertSameResponse(
  response: Response,
  missing: Response,
  status: number,
) {
  assert.equal(response.status, status);
  assert.equal(missing.status, status);
  assert.equal(await response.text(), await missing.text());
}
const missingId = `c${"x".repeat(24)}`;
async function makeSession(id: string) {
  const token = createOpaqueToken();
  const { authVersion } = await db.user.findUniqueOrThrow({
    where: { id },
    select: { authVersion: true },
  });
  await db.session.create({
    data: {
      userId: id,
      tokenHash: token.tokenHash,
      authVersion,
      expires: new Date(Date.now() + 3600000),
    },
  });
  return `postupai_session=${token.token}`;
}
async function login(email: string) {
  const response = await api("/api/auth/login", "POST", { email, password });
  assert.equal(response.status, 200, await response.clone().text());
  return response;
}
before(async () => {
  execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { env: { ...process.env }, stdio: "pipe", windowsHide: true },
  );
  await inbox.start();
  const hash = await hashPassword(password);
  for (const name of ["a", "b"]) {
    const user = await db.user.create({
      data: {
        email: `${name}@example.invalid`,
        name,
        passwordHash: hash,
        emailVerified: new Date(),
      },
    });
    if (name === "a") {
      userA = user.id;
      cookieA = await makeSession(user.id);
    } else {
      userB = user.id;
      cookieB = await makeSession(user.id);
    }
  }
  server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "-p",
      "3219",
      "-H",
      "127.0.0.1",
    ],
    {
      env: {
        ...process.env,
        NODE_ENV: "production",
        CATALOG_STORAGE: "snapshot",
      },
      stdio: "ignore",
      windowsHide: true,
    },
  );
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error("Account server exited");
    try {
      if ((await fetch(`${base}/api/health`)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.ok(ready);
});
after(async () => {
  if (server && server.exitCode === null) {
    const stopped = new Promise((resolve) => server!.once("exit", resolve));
    server.kill();
    await stopped;
  }
  await new Promise<void>((resolve) => inbox.server.close(() => resolve()));
  const { prisma } = await import("../db/index");
  await prisma.$disconnect();
  await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await db.$disconnect();
});
beforeEach(async () => {
  await db.rateLimitBucket.deleteMany();
});
describe("account HTTP and PostgreSQL security", { concurrency: false }, () => {
  it("requires authentication and same-origin mutations", async () => {
    for (const [path, method] of personalRoutes) {
      const response = await fetch(`${base}${path}?userId=${userA}`, {
        method,
        headers: { ...headers(), "x-account-id": userA },
        ...(method === "GET"
          ? {}
          : { body: JSON.stringify({ userId: userA }) }),
      });
      assert.equal(
        response.status,
        401,
        `${method} ${path} with forged account id and no cookie`,
      );
    }
    assert.equal(
      (await api("/api/favorites", "POST", { userId: userA })).status,
      410,
    );
    for (const [path, method] of [
      ["/api/user-state", "PUT"],
      ["/api/tracker", "POST"],
      ["/api/account/security", "POST"],
      ["/api/account/notifications", "PATCH"],
    ]) {
      assert.equal(
        (
          await fetch(`${base}${path}`, {
            method,
            headers: {
              cookie: cookieA,
              "x-account-id": userA,
              origin: "https://evil.invalid",
              "content-type": "application/json",
            },
            body: "{}",
          })
        ).status,
        403,
      );
    }
  });
  it("round-trips profiles and rejects stale simultaneous writes without leaking users", async () => {
    const wrongOwner = await fetch(`${base}/api/user-state`, {
      method: "PUT",
      headers: { ...headers(cookieB), "x-account-id": userA },
      body: JSON.stringify({
        version: 0,
        favoriteIds: [],
        comparisonIds: [],
        scoreSets: [],
      }),
    });
    assert.equal(wrongOwner.status, 409);
    for (const path of [
      "/api/user-state",
      "/api/tracker",
      "/api/account/security",
      "/api/account/notifications",
    ]) {
      const stale = await fetch(`${base}${path}`, {
        headers: { ...headers(cookieB), "x-account-id": userA },
      });
      assert.equal(stale.status, 409);
    }
    const current = await (
      await api("/api/user-state", "GET", undefined, cookieA)
    ).json();
    const state = {
      ...current.state,
      userId: userB,
      version: current.version,
      favoriteIds: ["hse-economics"],
      comparisonIds: ["hse-economics"],
      scoreSets: [
        {
          id: "main",
          name: "Основной",
          scores: { Математика: 90 },
          individualAchievements: 5,
          updatedAt: new Date().toISOString(),
        },
      ],
    };
    const results = await Promise.all([
      api("/api/user-state", "PUT", state, cookieA),
      api("/api/user-state", "PUT", state, cookieA),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    const saved = await (
      await api("/api/user-state", "GET", undefined, cookieA)
    ).json();
    assert.equal(saved.state.scoreSets[0].scores.Математика, 90);
    assert.deepEqual(
      (
        await (
          await api(
            `/api/user-state?userId=${userA}`,
            "GET",
            undefined,
            cookieB,
          )
        ).json()
      ).state.scoreSets,
      [],
    );
    const oversized = await api(
      "/api/user-state",
      "PUT",
      { ...state, extra: "x".repeat(65000) },
      cookieA,
    );
    assert.equal(oversized.status, 413);
  });
  it("keeps unavailable saved programs until their owner explicitly removes them", async () => {
    const previous = await db.userStateSnapshot.findUniqueOrThrow({
      where: { userId: userA },
    });
    const original = await (
      await api("/api/user-state", "GET", undefined, cookieA)
    ).json();
    await db.userStateSnapshot.update({
      where: { userId: userA },
      data: {
        state: {
          ...original.state,
          favoriteIds: ["unpublished-favorite"],
          comparisonIds: ["unpublished-comparison"],
        },
        version: { increment: 1 },
      },
    });
    const loaded = await (
      await api("/api/user-state", "GET", undefined, cookieA)
    ).json();
    assert.deepEqual(loaded.state.favoriteIds, ["unpublished-favorite"]);
    assert.deepEqual(loaded.state.comparisonIds, ["unpublished-comparison"]);
    const requested = {
      ...loaded.state,
      version: loaded.version,
      favoriteIds: [
        "unpublished-favorite",
        "hse-economics",
        "unpublished-comparison",
        "unknown",
      ],
      comparisonIds: [
        "unpublished-comparison",
        "unpublished-favorite",
        "unknown",
      ],
      scoreSets: [
        {
          id: "updated",
          name: "Обновлённый профиль",
          scores: { Математика: 91 },
          individualAchievements: 0,
          updatedAt: new Date().toISOString(),
        },
      ],
    };
    const response = await api("/api/user-state", "PUT", requested, cookieA);
    assert.equal(response.status, 200, await response.clone().text());
    const saved = await response.json();
    assert.deepEqual(saved.state.favoriteIds, [
      "unpublished-favorite",
      "hse-economics",
    ]);
    assert.deepEqual(saved.state.comparisonIds, ["unpublished-comparison"]);
    assert.deepEqual(saved.state.scoreSets, requested.scoreSets);
    assert.equal(saved.version, previous.version + 2);
    const reloaded = await (
      await api("/api/user-state", "GET", undefined, cookieA)
    ).json();
    assert.deepEqual(reloaded.state, saved.state);

    const other = await (
      await api("/api/user-state", "GET", undefined, cookieB)
    ).json();
    const otherResponse = await api(
      "/api/user-state",
      "PUT",
      {
        ...other.state,
        version: other.version,
        favoriteIds: ["unpublished-favorite"],
        comparisonIds: ["unpublished-comparison"],
      },
      cookieB,
    );
    assert.equal(otherResponse.status, 200);
    const otherSaved = await otherResponse.json();
    assert.deepEqual(otherSaved.state.favoriteIds, []);
    assert.deepEqual(otherSaved.state.comparisonIds, []);

    const removal = await api(
      "/api/user-state",
      "PUT",
      {
        ...saved.state,
        version: saved.version,
        favoriteIds: [],
        comparisonIds: [],
      },
      cookieA,
    );
    assert.equal(removal.status, 200);
    const removed = await removal.json();
    assert.equal(
      (await api("/api/user-state", "PUT", requested, cookieA)).status,
      409,
    );
    assert.deepEqual(
      await (await api("/api/user-state", "GET", undefined, cookieA)).json(),
      removed,
    );
    const cannotRestore = await api(
      "/api/user-state",
      "PUT",
      {
        ...requested,
        version: removed.version,
      },
      cookieA,
    );
    assert.equal(cannotRestore.status, 200);
    const filtered = await cannotRestore.json();
    assert.deepEqual(filtered.state.favoriteIds, ["hse-economics"]);
    assert.deepEqual(filtered.state.comparisonIds, []);
  });
  it("persists the tracker, protects ownership and version, and deduplicates reminders", async () => {
    const created = await api(
      "/api/tracker",
      "POST",
      { programKey: "hse-economics", admissionYear: 2027 },
      cookieA,
    );
    assert.equal(created.status, 201, await created.clone().text());
    const { item } = await created.json();
    const patch = {
      id: item.id,
      version: item.version,
      priority: 2,
      stage: "submitted",
      documentsReady: true,
      consentReady: false,
      deadlineAt: new Date().toISOString(),
      notes: "Личная заметка",
    };
    await assertSameResponse(
      await api("/api/tracker", "PATCH", patch, cookieB),
      await api("/api/tracker", "PATCH", { ...patch, id: missingId }, cookieB),
      404,
    );
    assert.equal(
      (await api("/api/tracker", "PATCH", patch, cookieA)).status,
      200,
    );
    assert.equal(
      (await api("/api/tracker", "PATCH", patch, cookieA)).status,
      409,
    );
    assert.equal(
      (
        await api(
          "/api/tracker",
          "POST",
          { programKey: "not-a-program", admissionYear: 2027 },
          cookieA,
        )
      ).status,
      400,
    );
    const stored = await (
      await api("/api/tracker", "GET", undefined, cookieA)
    ).json();
    assert.equal(stored.items[0].notes, "Личная заметка");
    assert.equal(stored.items[0].history.length, 2);
    assert.deepEqual(
      (await (await api("/api/tracker", "GET", undefined, cookieB)).json())
        .items,
      [],
    );
    const notices = await Promise.all([
      api("/api/account/notifications", "GET", undefined, cookieA),
      api("/api/account/notifications", "GET", undefined, cookieA),
    ]);
    assert.ok(notices.every((r) => r.status === 200));
    const list = await notices[1].json();
    assert.equal(list.items.length, 1);
    await assertSameResponse(
      await api(
        "/api/account/notifications",
        "PATCH",
        { readId: list.items[0].id },
        cookieB,
      ),
      await api(
        "/api/account/notifications",
        "PATCH",
        { readId: missingId },
        cookieB,
      ),
      404,
    );
    assert.equal(
      (
        await api(
          "/api/account/notifications",
          "PATCH",
          { readId: list.items[0].id },
          cookieA,
        )
      ).status,
      200,
    );
    await api(
      "/api/account/notifications",
      "PATCH",
      { enabled: false, userId: userB },
      cookieA,
    );
    assert.equal(
      (
        await (
          await api("/api/account/notifications", "GET", undefined, cookieA)
        ).json()
      ).enabled,
      false,
    );
    const otherNotifications = await (
      await api(
        `/api/account/notifications?userId=${userA}`,
        "GET",
        undefined,
        cookieB,
      )
    ).json();
    assert.equal(otherNotifications.enabled, true);
    assert.deepEqual(otherNotifications.items, []);
    await assertSameResponse(
      await api("/api/tracker", "DELETE", { id: item.id, version: 2 }, cookieB),
      await api(
        "/api/tracker",
        "DELETE",
        { id: missingId, version: 2 },
        cookieB,
      ),
      409,
    );
    assert.equal(
      (
        await api(
          "/api/tracker",
          "DELETE",
          { id: item.id, version: 2 },
          cookieA,
        )
      ).status,
      200,
    );
  });
  for (const change of ["deadline moved", "reminders disabled"] as const) {
    it(`rechecks eligibility of a waiting reminder when ${change}`, async () => {
      const deadlineAt = new Date();
      const item = await db.accountTrackerItem.create({
        data: {
          userId: userB,
          programKey: "hse-economics",
          admissionYear: 2096,
          deadlineAt,
          history: [],
        },
      });
      const noticeId = hashToken(
        `${userB}:${item.id}:${deadlineAt.toISOString()}`,
      );
      let request: Promise<Response> | undefined;
      try {
        await db.$transaction(
          async (tx) => {
            const [{ pid }] = await tx.$queryRaw<{ pid: number }[]>`
              SELECT pg_backend_pid() AS pid FROM "User" WHERE "id" = ${userB} FOR UPDATE`;
            request = fetch(`${base}/api/account/notifications`, {
              headers: headers(cookieB),
              signal: AbortSignal.timeout(20000),
            });
            void request.catch(() => {});
            await waitForEvidence(
              () => blockedBy(pid),
              "GET did not reach the reminder owner lock",
            );
            if (change === "deadline moved") {
              await tx.accountTrackerItem.update({
                where: { id: item.id },
                data: {
                  deadlineAt: new Date(deadlineAt.getTime() + 10 * 86400000),
                  version: { increment: 1 },
                },
              });
            } else {
              await tx.notificationPreference.create({
                data: {
                  userId: userB,
                  inAppEnabled: false,
                  deadlines: false,
                },
              });
            }
          },
          { timeout: 15000 },
        );
        assert.ok(request);
        const response = await request;
        assert.equal(response.status, 200, await response.clone().text());
        assert.deepEqual(await response.json(), {
          enabled: change === "deadline moved",
          items: [],
        });
        assert.equal(
          await db.notification.count({ where: { id: noticeId } }),
          0,
        );
      } finally {
        await request?.catch(() => {});
        await db.notification.deleteMany({ where: { id: noticeId } });
        await db.accountTrackerItem.deleteMany({ where: { id: item.id } });
        if (change === "reminders disabled")
          await db.notificationPreference.deleteMany({
            where: { userId: userB },
          });
      }
    });
  }
  it("serializes tracker deletion with an edit and rejects the stale version", async () => {
    const item = await db.accountTrackerItem.create({
      data: {
        userId: userA,
        programKey: "hse-economics",
        admissionYear: 2099,
        history: [],
      },
    });
    let deletion: Promise<Response> | undefined;
    try {
      await db.$transaction(
        async (tx) => {
          const [{ pid }] = await tx.$queryRaw<{ pid: number }[]>`
          SELECT pg_backend_pid() AS pid FROM "User" WHERE "id" = ${userA} FOR UPDATE`;
          let finished = false;
          deletion = fetch(`${base}/api/tracker`, {
            method: "DELETE",
            headers: headers(cookieA),
            body: JSON.stringify({ id: item.id, version: item.version }),
            signal: AbortSignal.timeout(20000),
          }).finally(() => {
            finished = true;
          });
          void deletion.catch(() => {});

          // Wait for the real HTTP transaction to block on this owner transaction.
          // Before the fix it had already deleted the tracker row when it blocked
          // on the audit FK, so the edit below could not acquire the tracker row.
          await waitForEvidence(async () => {
            assert.ok(!finished, "DELETE ended before the overlap barrier");
            return blockedBy(pid);
          }, "DELETE never waited on the transaction editing its owner");
          await tx.$executeRaw`SET LOCAL lock_timeout = '3s'`;
          await tx.accountTrackerItem.update({
            where: { id: item.id },
            data: {
              version: { increment: 1 },
              notes: "Concurrent fixture edit",
            },
          });
        },
        { timeout: 15000 },
      );

      assert.ok(deletion);
      const stale = await deletion;
      assert.equal(stale.status, 409, await stale.text());
      const stored = await db.accountTrackerItem.findUniqueOrThrow({
        where: { id: item.id },
      });
      assert.equal(stored.version, item.version + 1);
      assert.equal(stored.notes, "Concurrent fixture edit");
      const audit = {
        actorId: userA,
        entityId: item.id,
        action: "DELETE_TRACKER",
      };
      assert.equal(await db.auditLog.count({ where: audit }), 0);
      const removed = await api(
        "/api/tracker",
        "DELETE",
        { id: item.id, version: stored.version },
        cookieA,
      );
      assert.equal(removed.status, 200, await removed.text());
      assert.equal(
        await db.accountTrackerItem.findUnique({ where: { id: item.id } }),
        null,
      );
      assert.equal(await db.auditLog.count({ where: audit }), 1);
    } finally {
      await deletion?.catch(() => {});
      await db.accountTrackerItem.deleteMany({ where: { id: item.id } });
    }
  });
  it("rejects a tracker write already queued when its session is revoked", async () => {
    const cookie = await makeSession(userB);
    const tokenHash = hashToken(cookie.slice("postupai_session=".length));
    const item = await db.accountTrackerItem.create({
      data: {
        userId: userB,
        programKey: "hse-economics",
        admissionYear: 2098,
        history: [],
      },
    });
    let deletion: Promise<Response> | undefined;
    try {
      await db.$transaction(
        async (tx) => {
          const [{ pid }] = await tx.$queryRaw<{ pid: number }[]>`
          SELECT pg_backend_pid() AS pid FROM "User" WHERE "id" = ${userB} FOR UPDATE`;
          deletion = fetch(`${base}/api/tracker`, {
            method: "DELETE",
            headers: headers(cookie),
            body: JSON.stringify({ id: item.id, version: item.version }),
            signal: AbortSignal.timeout(20000),
          });
          void deletion.catch(() => {});
          await waitForEvidence(
            () => blockedBy(pid),
            "DELETE did not reach the owner lock",
          );
          await tx.session.update({
            where: { tokenHash },
            data: { revokedAt: new Date() },
          });
        },
        { timeout: 15000 },
      );
      assert.ok(deletion);
      const response = await deletion;
      assert.equal(response.status, 401, await response.text());
      assert.deepEqual(
        await db.accountTrackerItem.findUnique({ where: { id: item.id } }),
        item,
      );
      assert.equal(
        await db.auditLog.count({
          where: {
            actorId: userB,
            entityId: item.id,
            action: "DELETE_TRACKER",
          },
        }),
        0,
      );
      assert.equal(
        (await api("/api/tracker", "GET", undefined, cookieB)).status,
        200,
      );
    } finally {
      await deletion?.catch(() => {});
      await db.accountTrackerItem.deleteMany({ where: { id: item.id } });
      await db.session.deleteMany({ where: { tokenHash, userId: userB } });
    }
  });
  it("imports only explicitly owned legacy data and preserves existing server edits", async () => {
    const body = {
      admissionYear: 2027,
      userId: userB,
      items: [
        {
          programId: "hse-economics",
          userId: userB,
          priority: 4,
          stage: "documents",
          documentsReady: true,
          consentReady: false,
        },
      ],
    };
    assert.equal(
      (await api("/api/tracker/import", "POST", body, cookieA)).status,
      400,
    );
    assert.equal(
      (
        await api(
          "/api/tracker/import",
          "POST",
          { ...body, confirmedOwner: true },
          cookieA,
        )
      ).status,
      200,
    );
    body.items[0].priority = 8;
    assert.equal(
      (
        await api(
          "/api/tracker/import",
          "POST",
          { ...body, confirmedOwner: true },
          cookieA,
        )
      ).status,
      200,
    );
    const rows = await (
      await api("/api/tracker", "GET", undefined, cookieA)
    ).json();
    assert.equal(rows.items.length, 1);
    assert.equal(rows.items[0].priority, 4);
    assert.equal(
      await db.accountTrackerItem.count({ where: { userId: userB } }),
      0,
    );
  });
  it("rejects expired credentials and revokes only the selected logout session", async () => {
    const expired = createOpaqueToken();
    await db.session.create({
      data: {
        userId: userB,
        tokenHash: expired.tokenHash,
        expires: new Date(0),
      },
    });
    assert.equal(
      (
        await api(
          "/api/user-state",
          "GET",
          undefined,
          `postupai_session=${expired.token}`,
        )
      ).status,
      401,
    );
    const verification = createOpaqueToken();
    const pendingEmail = "expired-verification@example.invalid";
    const existingUser = await db.user.findUniqueOrThrow({
      where: { id: userB },
      select: { passwordHash: true },
    });
    await db.user.create({
      data: { email: pendingEmail, passwordHash: existingUser.passwordHash },
    });
    await db.verificationToken.create({
      data: {
        identifier: pendingEmail,
        tokenHash: verification.tokenHash,
        expires: new Date(0),
      },
    });
    assert.equal(
      (
        await api("/api/auth/verify-email", "POST", {
          token: verification.token,
          password,
        })
      ).status,
      400,
    );
    const reset = createOpaqueToken();
    await db.passwordResetToken.create({
      data: { userId: userB, tokenHash: reset.tokenHash, expires: new Date(0) },
    });
    assert.equal(
      (
        await api("/api/auth/reset-password", "POST", {
          token: reset.token,
          password,
        })
      ).status,
      400,
    );
    const { createTwoFactorChallenge } = await import("../lib/auth/service");
    const user = await db.user.findUniqueOrThrow({ where: { id: userB } });
    const id = await createTwoFactorChallenge(user);
    const code = lastCode();
    assert.ok(id);
    await db.authChallenge.update({
      where: { id },
      data: { expiresAt: new Date(0) },
    });
    assert.equal(
      (await api("/api/auth/two-factor", "POST", { challengeId: id, code }))
        .status,
      401,
    );
    const single = await makeSession(userB);
    assert.equal(
      (await api("/api/auth/logout", "POST", undefined, single)).status,
      200,
    );
    assert.equal(
      (await api("/api/user-state", "GET", undefined, single)).status,
      401,
    );
    assert.equal(
      (await api("/api/user-state", "GET", undefined, cookieB)).status,
      200,
    );
  });
  it("rejects stale-account logout requests without clearing cookies or revoking sessions", async () => {
    const second = await makeSession(userB);
    const before = await db.user.findUniqueOrThrow({ where: { id: userB } });
    const auditCount = await db.auditLog.count({ where: { actorId: userB } });
    const sessions = await db.session.findMany({
      where: { userId: userB },
      orderBy: { id: "asc" },
    });
    for (const path of ["/api/auth/logout", "/api/auth/logout-all"]) {
      for (const accountId of [userA, undefined]) {
        const requestHeaders = new Headers(headers(cookieB));
        if (accountId) requestHeaders.set("x-account-id", accountId);
        else requestHeaders.delete("x-account-id");
        const response = await fetch(`${base}${path}`, {
          method: "POST",
          headers: requestHeaders,
        });
        assert.equal(response.status, 409, await response.clone().text());
        assert.equal(response.headers.get("set-cookie"), null);
      }
    }
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { id: userB } })).authVersion,
      before.authVersion,
    );
    assert.equal(
      await db.auditLog.count({ where: { actorId: userB } }),
      auditCount,
    );
    assert.deepEqual(
      await db.session.findMany({
        where: { userId: userB },
        orderBy: { id: "asc" },
      }),
      sessions,
    );
    for (const cookie of [cookieB, second]) {
      assert.equal(
        (await api("/api/user-state", "GET", undefined, cookie)).status,
        200,
      );
    }
    assert.equal(
      (await api("/api/auth/logout", "POST", undefined, second)).status,
      200,
    );
  });
  it("registers, resends verification and consumes a verification link exactly once", async () => {
    const registration = {
      email: "new@example.invalid",
      name: "Новый",
      password,
    };
    const beforeRegistration = inbox.messages.length;
    assert.equal(
      (await api("/api/auth/register", "POST", registration)).status,
      202,
    );
    await waitForMail(beforeRegistration);
    const oldToken = lastToken();
    assert.equal(
      (await api("/api/auth/login", "POST", registration)).status,
      403,
    );
    const beforeResend = inbox.messages.length;
    assert.equal(
      (
        await api("/api/auth/resend-verification", "POST", {
          email: registration.email,
        })
      ).status,
      202,
    );
    await waitForMail(beforeResend);
    const token = lastToken();
    assert.equal(
      (
        await api("/api/auth/verify-email", "POST", {
          token: oldToken,
          password,
        })
      ).status,
      400,
    );
    await assertSameResponse(
      await api("/api/auth/verify-email", "POST", { token }),
      await api("/api/auth/verify-email", "POST", {
        token,
        password: "WrongReliablePassword2027",
      }),
      400,
    );
    assert.equal(
      (
        await db.user.findUniqueOrThrow({
          where: { email: registration.email },
        })
      ).emailVerified,
      null,
    );
    const result = await Promise.all([
      api("/api/auth/verify-email", "POST", { token, password }),
      api("/api/auth/verify-email", "POST", { token, password }),
    ]);
    assert.deepEqual(result.map((r) => r.status).sort(), [200, 400]);
    const signed = await login(registration.email);
    const cookie = signed.headers.get("set-cookie")!;
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /Secure/i);
    assert.match(cookie, /SameSite=lax/i);
    assert.equal(
      (await api("/api/auth/register", "POST", registration)).status,
      202,
    );
  });
  it("lets a mailbox owner replace a pending account password before confirming email", async () => {
    const email = "pending-owner@example.invalid";
    const originalPassword = "SomeoneElsesPassword2027";
    const ownerPassword = "MailboxOwnerPassword2028";
    const beforeRegistration = inbox.messages.length;
    assert.equal(
      (
        await api("/api/auth/register", "POST", {
          email,
          name: "Pending fixture",
          password: originalPassword,
        })
      ).status,
      202,
    );
    await waitForMail(beforeRegistration);
    const verificationToken = lastToken();
    assert.equal(
      (
        await api("/api/auth/verify-email", "POST", {
          token: verificationToken,
          password: ownerPassword,
        })
      ).status,
      400,
    );

    const beforeReset = inbox.messages.length;
    assert.equal(
      (await api("/api/auth/forgot-password", "POST", { email })).status,
      202,
    );
    await waitForMail(beforeReset);
    const resetToken = lastToken();
    assert.equal(
      (
        await api("/api/auth/reset-password", "POST", {
          token: resetToken,
          password: ownerPassword,
        })
      ).status,
      200,
    );
    assert.equal(
      (await api("/api/auth/login", "POST", { email, password: ownerPassword }))
        .status,
      403,
    );
    assert.equal(
      (
        await api("/api/auth/verify-email", "POST", {
          token: verificationToken,
          password: originalPassword,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await api("/api/auth/verify-email", "POST", {
          token: verificationToken,
          password: ownerPassword,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await api("/api/auth/login", "POST", {
          email,
          password: originalPassword,
        })
      ).status,
      401,
    );
    assert.equal(
      (await api("/api/auth/login", "POST", { email, password: ownerPassword }))
        .status,
      200,
    );
  });
  it("keeps public auth responses indistinguishable when loopback SMTP rejects delivery", async () => {
    await db.user.create({ data: { email: "pending-mail@example.invalid" } });
    const registration = { name: "Mail fixture", password };
    const baseline = inbox.rejectedCount();
    inbox.setRejectDelivery(true);
    try {
      for (const [path, send, noSend] of [
        [
          "/api/auth/register",
          { ...registration, email: "new-mail@example.invalid" },
          { ...registration, email: "a@example.invalid" },
        ],
        [
          "/api/auth/forgot-password",
          { email: "a@example.invalid" },
          { email: "absent-mail@example.invalid" },
        ],
        [
          "/api/auth/resend-verification",
          { email: "pending-mail@example.invalid" },
          { email: "absent-mail@example.invalid" },
        ],
      ] as const) {
        await assertSameResponse(
          await api(path, "POST", send),
          await api(path, "POST", noSend),
          202,
        );
      }
      await waitForEvidence(
        () => inbox.rejectedCount() === baseline + 3,
        "SMTP rejection was not exercised for all three mail requests",
      );
    } finally {
      inbox.setRejectDelivery(false);
    }
  });
  it("enables email two-step login with password and email proof, and rejects reused codes", async () => {
    assert.equal(
      (
        await api(
          "/api/account/security",
          "POST",
          { enabled: true, password: "wrong" },
          cookieA,
        )
      ).status,
      403,
    );
    const start = await api(
      "/api/account/security",
      "POST",
      { enabled: true, password },
      cookieA,
    );
    assert.equal(start.status, 200, await start.clone().text());
    const { challengeId } = await start.json();
    const code = lastCode();
    await assertSameResponse(
      await api(
        "/api/account/security",
        "PATCH",
        { enabled: true, challengeId, code },
        cookieB,
      ),
      await api(
        "/api/account/security",
        "PATCH",
        { enabled: true, challengeId: missingId, code },
        cookieB,
      ),
      400,
    );
    assert.equal(
      (
        await api(
          "/api/account/security",
          "PATCH",
          { enabled: true, challengeId, code },
          cookieA,
        )
      ).status,
      200,
    );
    assert.equal(
      (await api("/api/user-state", "GET", undefined, cookieA)).status,
      401,
    );
    const prompt = await login("a@example.invalid");
    const challenge = await prompt.json();
    assert.equal(challenge.requiresTwoFactor, true);
    assert.equal(prompt.headers.get("set-cookie"), null);
    const body = { challengeId: challenge.challengeId, code: lastCode() };
    const results = await Promise.all([
      api("/api/auth/two-factor", "POST", body),
      api("/api/auth/two-factor", "POST", body),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 401]);
    cookieA = results
      .find((r) => r.status === 200)!
      .headers.get("set-cookie")!
      .split(";")[0];
    assert.equal(
      (await api("/api/user-state", "GET", undefined, cookieA)).status,
      200,
    );
  });
  it("caps code guesses even when requests race", async () => {
    const start = await (await login("a@example.invalid")).json();
    const code = lastCode();
    const wrong = code === "111111" ? "222222" : "111111";
    const guesses = await Promise.all(
      Array.from({ length: 6 }, () =>
        api("/api/auth/two-factor", "POST", {
          challengeId: start.challengeId,
          code: wrong,
        }),
      ),
    );
    assert.ok(guesses.every((r) => r.status === 401));
    assert.equal(
      (
        await api("/api/auth/two-factor", "POST", {
          challengeId: start.challengeId,
          code,
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await db.authChallenge.findUniqueOrThrow({
          where: { id: start.challengeId },
        })
      ).attempts,
      5,
    );
  });
  it("resets the password once and revokes old sessions, challenges and reset links", async () => {
    const prompt = await (await login("a@example.invalid")).json();
    const code = lastCode();
    const beforeFirstReset = inbox.messages.length;
    await api("/api/auth/forgot-password", "POST", {
      email: "a@example.invalid",
    });
    await waitForMail(beforeFirstReset);
    const old = lastToken();
    const beforeSecondReset = inbox.messages.length;
    await api("/api/auth/forgot-password", "POST", {
      email: "a@example.invalid",
    });
    await waitForMail(beforeSecondReset);
    const token = lastToken();
    assert.equal(
      (
        await api("/api/auth/reset-password", "POST", {
          token: old,
          password: "NewReliablePassword2028",
        })
      ).status,
      400,
    );
    const results = await Promise.all([
      api("/api/auth/reset-password", "POST", {
        token,
        password: "NewReliablePassword2028",
      }),
      api("/api/auth/reset-password", "POST", {
        token,
        password: "NewReliablePassword2028",
      }),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
    assert.equal(
      (await api("/api/user-state", "GET", undefined, cookieA)).status,
      401,
    );
    assert.equal(
      (
        await api("/api/auth/two-factor", "POST", {
          challengeId: prompt.challengeId,
          code,
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await api("/api/auth/login", "POST", {
          email: "a@example.invalid",
          password,
        })
      ).status,
      401,
    );
    const changed = await api("/api/auth/login", "POST", {
      email: "a@example.invalid",
      password: "NewReliablePassword2028",
    });
    assert.equal(changed.status, 200);
    assert.equal((await changed.json()).requiresTwoFactor, true);
    const audit = await db.auditLog.findMany({ where: { actorId: userA } });
    assert.ok(audit.some((row) => row.action === "RESET_PASSWORD"));
    assert.ok(!JSON.stringify(audit).includes(token));
  });
  it("completes overlapping single and bulk logout without a database deadlock", async () => {
    const { prisma: serviceDb } = await import("../db/index");
    const { revokeSession, revokeAllSessions } = await import(
      "../lib/auth/service"
    );
    const owner = await db.user.create({
      data: { email: "logout-race@example.invalid", emailVerified: new Date() },
    });
    const token = createOpaqueToken();
    await db.session.create({
      data: {
        userId: owner.id,
        tokenHash: token.tokenHash,
        expires: new Date(Date.now() + 60000),
      },
    });
    let ownerLocked!: () => void,
      releaseBulk!: () => void,
      singleBoundary!: () => void;
    const locked = new Promise<void>((resolve) => {
      ownerLocked = resolve;
    });
    const proceed = new Promise<void>((resolve) => {
      releaseBulk = resolve;
    });
    const boundary = new Promise<void>((resolve) => {
      singleBoundary = resolve;
    });
    const originalTransaction = serviceDb.$transaction;
    let transactionNumber = 0;
    const pending: Promise<unknown>[] = [];
    // Hold bulk logout after its owner update. Single logout must either wait
    // for that owner, or reach its old session-write boundary. Release bulk at
    // that boundary so the old Session -> User / User -> Session cycle is real.
    const controlledTransaction = (
      callback: (tx: Prisma.TransactionClient) => Promise<unknown>,
    ) => {
      const number = transactionNumber++;
      return originalTransaction.call(serviceDb, async (tx) =>
        callback(
          new Proxy(tx, {
            get(target, property) {
              if (number === 0 && property === "user")
                return new Proxy(target.user, {
                  get(delegate, key) {
                    if (key !== "update") return Reflect.get(delegate, key);
                    return async (
                      ...args: Parameters<typeof delegate.update>
                    ) => {
                      const result = await delegate.update(...args);
                      ownerLocked();
                      await proceed;
                      return result;
                    };
                  },
                });
              if (number === 1 && property === "$queryRaw")
                return (...args: unknown[]) => {
                  singleBoundary();
                  return Reflect.apply(target.$queryRaw, target, args);
                };
              if (number === 1 && property === "session")
                return new Proxy(target.session, {
                  get(delegate, key) {
                    if (key !== "updateMany") return Reflect.get(delegate, key);
                    return async (
                      ...args: Parameters<typeof delegate.updateMany>
                    ) => {
                      const result = await delegate.updateMany(...args);
                      singleBoundary();
                      return result;
                    };
                  },
                });
              return Reflect.get(target, property);
            },
          }),
        ),
      );
    };
    try {
      Reflect.set(serviceDb, "$transaction", controlledTransaction);
      const bulk = revokeAllSessions(owner.id);
      pending.push(bulk);
      // A transaction failure must interrupt the barrier rather than hang QA.
      await Promise.race([
        locked,
        bulk.then(() => {
          throw new Error("Bulk logout ended before the owner-lock barrier");
        }),
      ]);
      const single = revokeSession(token.token);
      pending.push(single);
      await Promise.race([
        boundary,
        single.then(() => {
          throw new Error("Single logout ended before the overlap barrier");
        }),
      ]);
      releaseBulk();
      const results = await Promise.allSettled(pending);
      for (const result of results)
        if (result.status === "rejected") throw result.reason;
      assert.deepEqual(
        results.map((result) => result.status),
        ["fulfilled", "fulfilled"],
      );
      assert.ok(
        (
          await db.session.findUniqueOrThrow({
            where: { tokenHash: token.tokenHash },
          })
        ).revokedAt,
      );
      assert.equal(
        (await db.user.findUniqueOrThrow({ where: { id: owner.id } }))
          .authVersion,
        1,
      );
      assert.deepEqual(
        (
          await db.auditLog.findMany({
            where: { actorId: owner.id },
            select: { action: true },
          })
        )
          .map((row) => row.action)
          .sort(),
        ["REVOKE_ALL_SESSIONS"],
      );
    } finally {
      releaseBulk();
      await Promise.allSettled(pending);
      Reflect.set(serviceDb, "$transaction", originalTransaction);
      await db.user.delete({ where: { id: owner.id } });
    }
  });
  it("revokes all sessions and prevents issuing a session from stale credentials", async () => {
    const second = await makeSession(userB);
    cookieA = await makeSession(userA);
    const { createSession } = await import("../lib/auth/service");
    const user = await db.user.findUniqueOrThrow({ where: { id: userB } });
    assert.equal(
      (await api("/api/auth/logout-all", "POST", { userId: userA }, cookieB))
        .status,
      200,
    );
    assert.equal(
      (await api("/api/user-state", "GET", undefined, second)).status,
      401,
    );
    assert.equal(await createSession(userB, {}, user.authVersion), null);
    assert.equal(
      (await api("/api/user-state", "GET", undefined, cookieA)).status,
      200,
    );
  });
  it("denies old-version cookies on all account routes and the account page", async () => {
    const stale = await makeSession(userB);
    const staleHash = hashToken(stale.slice("postupai_session=".length));
    const { authVersion } = await db.user.update({
      where: { id: userB },
      data: { authVersion: { increment: 1 }, name: "Fixture owner B" },
    });
    const staleRow = await db.session.findUniqueOrThrow({
      where: { tokenHash: staleHash },
    });
    assert.equal(
      staleRow.revokedAt,
      null,
      "This regression isolates version mismatch from revokedAt",
    );
    for (const [path, method] of personalRoutes) {
      assert.equal(
        (
          await api(
            path,
            method,
            method === "GET" ? undefined : { userId: userA },
            stale,
          )
        ).status,
        401,
        `${method} ${path} accepted a stale version`,
      );
    }
    const stalePage = await fetch(`${base}/account?userId=${userB}`, {
      headers: { cookie: stale },
      redirect: "manual",
    });
    assert.equal(stalePage.status, 307);
    assert.match(
      stalePage.headers.get("location") ?? "",
      /\/login\?returnTo=\/account/,
    );
    const { createSession } = await import("../lib/auth/service");
    const created = await createSession(userB, {}, authVersion);
    assert.ok(created);
    const fresh = `postupai_session=${created.token}`;
    const session = await db.session.findUniqueOrThrow({
      where: { tokenHash: hashToken(created.token) },
    });
    assert.equal(session.authVersion, authVersion);
    const security = await api(
      `/api/account/security?userId=${userA}`,
      "GET",
      undefined,
      fresh,
    );
    assert.equal(security.status, 200);
    const { sessions } = await security.json();
    assert.deepEqual(
      sessions.map((row: { id: string }) => row.id),
      [session.id],
    );
    const account = await fetch(`${base}/account?userId=${userA}`, {
      headers: { cookie: fresh },
      redirect: "manual",
    });
    assert.equal(account.status, 200);
    assert.match(await account.text(), /Fixture owner B/);
  });
  it("shares atomic limits across concurrent calls, expires buckets, and ignores untrusted forwarded IPs", async () => {
    const { checkRateLimit } = await import("../lib/security/rate-limit");
    const results = await Promise.all(
      Array.from({ length: 10 }, () => checkRateLimit("concurrent", 5, 60000)),
    );
    assert.equal(results.filter((r) => r.allowed).length, 5);
    await db.rateLimitBucket.update({
      where: { key: hashToken("concurrent") },
      data: { resetAt: new Date(0) },
    });
    assert.equal((await checkRateLimit("concurrent", 5, 60000)).allowed, true);
    const replies = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        fetch(`${base}/api/auth/login`, {
          method: "POST",
          headers: { ...headers(), "x-forwarded-for": `192.0.2.${i}` },
          body: JSON.stringify({ email: "bad", password: "bad" }),
        }),
      ),
    );
    assert.equal(replies.filter((r) => r.status === 429).length, 2);
  });
  it("stores and enforces rate limit windows in UTC in a non-UTC session", async () => {
    const { checkRateLimit } = await import("../lib/security/rate-limit");
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL TIME ZONE 'Europe/Moscow'`;
      const [{ now }] = await tx.$queryRaw<{ now: Date }[]>`
        SELECT CURRENT_TIMESTAMP::timestamptz(3) AS now`;
      const key = "non-utc-window";
      const expectedReset = now.getTime() + 60_000;
      const first = await checkRateLimit(key, 1, 60_000, tx);
      assert.equal(first.allowed, true);
      assert.equal(first.resetAt, expectedReset);

      const second = await checkRateLimit(key, 1, 60_000, tx);
      assert.equal(second.allowed, false);
      assert.equal(second.resetAt, expectedReset);

      await tx.rateLimitBucket.update({
        where: { key: hashToken(key) },
        data: { resetAt: new Date(now.getTime() - 60_000) },
      });
      const renewed = await checkRateLimit(key, 1, 60_000, tx);
      assert.equal(renewed.allowed, true);
      assert.equal(renewed.resetAt, expectedReset);
    });
  });
});
