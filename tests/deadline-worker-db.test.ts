import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { after, before, it } from "node:test";
import { PrismaClient } from "@prisma/client";
import { hashToken } from "../lib/auth/crypto";
import { baselineCatalog } from "../lib/catalog/baseline";
import { reviewCatalog, stageCatalog } from "../lib/catalog/service";
import type { TransactionalEmail } from "../lib/notifications/email";
import {
  dispatchClaimedDeadlineEmail,
  runDeadlineTick,
} from "../lib/operations/deadline-worker";

const url = new URL(process.env.TEST_DATABASE_URL ?? "");
if (
  !["127.0.0.1", "localhost"].includes(url.hostname) ||
  !url.pathname.endsWith("_test")
)
  throw new Error("Dedicated loopback _test database required");
const schema = `deadline_test_${randomUUID().replaceAll("-", "")}`;
url.searchParams.set("schema", schema);
const env = {
  ...process.env,
  DATABASE_URL: url.href,
  CATALOG_STORAGE: "database",
  DEPLOYMENT_MODE: "staging",
  DEADLINE_EMAIL_ENABLED: "false",
};
const db = new PrismaClient({ datasources: { db: { url: url.href } } });
const editor = { id: "deadline-fixture-editor", role: "ADMIN" as const };
const program = baselineCatalog().programs[0];

function cli(script: string, arg: string, extra?: Record<string, string>) {
  return new Promise<{ ok: boolean; stdout: string; stderr: string }>(
    (resolve) => {
      execFile(
        process.execPath,
        ["--import", "tsx", script, arg],
        {
          env: { ...env, ...extra },
          timeout: 25000,
          windowsHide: true,
        },
        (error, stdout, stderr) => resolve({ ok: !error, stdout, stderr }),
      );
    },
  );
}

async function owner(optIn = false, verified = true) {
  const user = await db.user.create({
    data: {
      email: `deadline-${randomUUID()}@example.invalid`,
      emailVerified: verified ? new Date() : null,
      passwordHash: "fixture-password-hash",
      ...(optIn
        ? { notificationPreference: { create: { deadlineEmailEnabled: true } } }
        : {}),
    },
  });
  return user;
}

function tracker(userId: string, hours = 24, stage = "shortlist") {
  return db.accountTrackerItem.create({
    data: {
      userId,
      programKey: program.slug,
      admissionYear: 2026,
      deadlineAt: new Date(Date.now() + hours * 3600000),
      notes: "private fixture applicant note",
      history: [],
      stage,
    },
  });
}

before(async () => {
  execFileSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    {
      env,
      windowsHide: true,
      stdio: "pipe",
      timeout: 35000,
    },
  );
  const baseline = baselineCatalog();
  await db.user.create({
    data: { ...editor, email: "deadline-editor@example.invalid" },
  });
  const fixture = {
    ...baseline,
    programs: [program],
    universities: baseline.universities.filter(
      (row) => row.slug === program.universitySlug,
    ),
    universityFacts: baseline.universityFacts.filter(
      (row) => row.universitySlug === program.universitySlug,
    ),
    directoryDetails: baseline.directoryDetails.filter(
      (row) => row.universitySlug === program.universitySlug,
    ),
    admissionCampaigns: baseline.admissionCampaigns.filter(
      (row) => row.universitySlug === program.universitySlug,
    ),
  };
  const options = {
    actor: editor,
    expectedRevisionId: null,
    reason: "Изолированная проверка напоминаний",
  };
  const revision = await stageCatalog(db, fixture, options);
  await reviewCatalog(db, revision.id, "publish", options);
});

after(async () => {
  await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await db.$disconnect();
});

it("creates in-app notices while the cabinet is closed, reuses the legacy key and records heartbeat", async () => {
  const user = await owner();
  const row = await tracker(user.id, -2);
  const notificationId = hashToken(
    `${user.id}:${row.id}:${row.deadlineAt!.toISOString()}`,
  );
  assert.equal((await cli("scripts/deadline-worker.ts", "--once")).ok, true);
  assert.equal((await cli("scripts/deadline-worker.ts", "--once")).ok, true);
  const notice = await db.notification.findUniqueOrThrow({
    where: { id: notificationId },
  });
  assert.equal(notice.type, "PERSONAL_DEADLINE");
  assert.match(notice.body, /Срок задан вами/);
  assert.equal(await db.notification.count({ where: { userId: user.id } }), 1);
  assert.equal(await db.deadlineEmailJob.count(), 0);
  assert.equal((await cli("scripts/deadline-worker.ts", "--status")).ok, true);
});

it("queues only verified opt-ins and retries an explicit temporary SMTP rejection with the same message id", async () => {
  const optedIn = await owner(true);
  await tracker(optedIn.id);
  await tracker((await owner()).id);
  await tracker((await owner(true, false)).id);
  await tracker((await owner(true)).id, -1);
  await tracker((await owner(true)).id, 24, "enrolled");
  const sends: TransactionalEmail[] = [];
  const delivery = {
    appOrigin: "https://fixture.example.invalid",
    provider: {
      async send(email: TransactionalEmail) {
        sends.push(email);
        if (sends.length === 1) throw { responseCode: 451 };
      },
    },
  };
  const first = await runDeadlineTick(db, delivery);
  assert.equal(first.emailQueued, 1);
  assert.equal(first.email?.deferred, 1);
  const queued = await db.deadlineEmailJob.findFirstOrThrow();
  assert.equal(queued.userId, optedIn.id);
  assert.equal(queued.state, "PENDING");
  assert.equal(queued.attempts, 1);
  await db.deadlineEmailJob.update({
    where: { id: queued.id },
    data: { availableAt: new Date(0) },
  });
  const [a, b] = await Promise.all([
    runDeadlineTick(db, delivery),
    runDeadlineTick(db, delivery),
  ]);
  assert.equal((a.email?.sent ?? 0) + (b.email?.sent ?? 0), 1);
  assert.equal(sends.length, 2);
  assert.equal(sends[0].messageId, sends[1].messageId);
  assert.equal(sends[1].to, optedIn.email);
  assert.match(sends[1].text, /\/account#tracker/);
  assert.doesNotMatch(sends[1].text, /private fixture applicant note/);
  assert.equal(
    (await db.deadlineEmailJob.findUniqueOrThrow({ where: { id: queued.id } }))
      .state,
    "SENT",
  );
});

it("rechecks opt-out after a durable claim, resumes cancelled work after renewed consent, and never retries an expired claim", async () => {
  const stopped = await owner(true),
    uncertain = await owner(true);
  const a = await tracker(stopped.id),
    b = await tracker(uncertain.id);
  const id = (row: typeof a) =>
    hashToken(`${row.userId}:${row.id}:${row.deadlineAt!.toISOString()}`);
  await db.deadlineEmailJob.createMany({
    data: [a, b].map((row, index) => ({
      id: id(row),
      userId: row.userId,
      trackerItemId: row.id,
      deadlineAt: row.deadlineAt!,
      availableAt: new Date(0),
      state: "SENDING",
      attempts: 1,
      leaseUntil: index ? new Date(0) : new Date(Date.now() + 60_000),
    })),
  });
  const claimed = await db.deadlineEmailJob.findUniqueOrThrow({
    where: { id: id(a) },
  });
  await db.notificationPreference.update({
    where: { userId: stopped.id },
    data: { deadlineEmailEnabled: false },
  });
  let calls = 0;
  const delivery = {
    appOrigin: "https://fixture.example.invalid",
    provider: {
      async send() {
        calls++;
      },
    },
  };
  assert.equal(await dispatchClaimedDeadlineEmail(db, claimed, delivery), null);
  await runDeadlineTick(db, delivery);
  assert.equal(calls, 0);
  assert.equal(
    (await db.deadlineEmailJob.findUniqueOrThrow({ where: { id: id(a) } }))
      .state,
    "CANCELLED",
  );
  assert.equal(
    (await db.deadlineEmailJob.findUniqueOrThrow({ where: { id: id(b) } }))
      .state,
    "UNKNOWN",
  );
  await db.notificationPreference.update({
    where: { userId: stopped.id },
    data: { deadlineEmailEnabled: true },
  });
  await runDeadlineTick(db, delivery);
  const sent = await db.deadlineEmailJob.findUniqueOrThrow({
    where: { id: claimed.id },
  });
  assert.equal(sent.state, "SENT");
  assert.equal(sent.attempts, 1);
  assert.equal(calls, 1);
});

it("bootstraps only one verified operator under concurrent invocations and revokes existing access", async () => {
  const users = [await owner(), await owner()];
  await Promise.all(
    users.map(async ({ id }) => {
      await db.session.create({
        data: {
          userId: id,
          tokenHash: randomUUID(),
          expires: new Date(Date.now() + 3600000),
        },
      });
      await db.authChallenge.create({
        data: {
          userId: id,
          type: "EMAIL_2FA_LOGIN",
          tokenHash: randomUUID(),
          expiresAt: new Date(Date.now() + 60000),
        },
      });
    }),
  );
  const results = await Promise.all(
    users.map(({ id }) =>
      cli("scripts/bootstrap-staff.ts", "--apply", { BOOTSTRAP_USER_ID: id }),
    ),
  );
  assert.equal(results.filter(({ ok }) => ok).length, 1);
  for (const result of results)
    assert.doesNotMatch(
      result.stdout + result.stderr,
      /example\.invalid|fixture-password-hash/,
    );
  const admin = await db.user.findFirstOrThrow({
    where: { role: "SUPERADMIN" },
  });
  assert.equal(admin.authVersion, 1);
  assert.equal(admin.passwordHash, "fixture-password-hash");
  assert.equal(
    await db.session.count({
      where: { userId: admin.id, revokedAt: { not: null } },
    }),
    1,
  );
  assert.equal(
    await db.authChallenge.count({
      where: { userId: admin.id, usedAt: { not: null } },
    }),
    1,
  );
  assert.equal(
    await db.auditLog.count({
      where: { action: "BOOTSTRAP_SUPERADMIN", entityId: admin.id },
    }),
    1,
  );
});
