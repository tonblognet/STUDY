import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !new URL(testUrl).pathname.endsWith("_test"))
  throw new Error("Dedicated TEST_DATABASE_URL ending in _test required");

test("account migration preserves legacy tracker data and explicit document readiness", async () => {
  const schema = `account_migration_${randomUUID().replaceAll("-", "")}`;
  const url = new URL(testUrl);
  url.searchParams.set("schema", schema);
  const db = new PrismaClient({
    datasources: { db: { url: url.toString() } },
  });
  const directory = new URL("../prisma/migrations/", import.meta.url);
  const accountMigration = "20261002190000_account_security";
  let created = false;
  // Execute each real migration as one SQL command, including dollar-quoted
  // functions. The DO block also makes each migration atomic in this fixture.
  const apply = async (name, client = db) => {
    const sql = await readFile(
      new URL(`${name}/migration.sql`, directory),
      "utf8",
    );
    await client.$executeRawUnsafe(
      `DO $migration$ BEGIN\n${sql}\nEND; $migration$;`,
    );
  };
  try {
    await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    const migrations = (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && entry.name < accountMigration)
      .map((entry) => entry.name)
      .sort();
    for (const name of migrations) await apply(name);

    const at = new Date("2026-10-01T09:30:00.000Z");
    // Legacy TIMESTAMP columns contain UTC wall-clock values. Send text, not a
    // Date parameter that PostgreSQL would convert through the session timezone.
    const utcTimestamp = at.toISOString().slice(0, -1);
    const state = {
      // The public saved-list ID deliberately differs from the relational slug.
      favoriteIds: ["synthetic-public-id"],
      comparisonIds: [],
      scoreSets: [],
    };
    const stages = {
      PLANNING: "shortlist",
      DOCUMENTS_READY: "documents",
      SUBMITTED: "submitted",
      IN_COMPETITION: "ranked",
      ENROLLED: "enrolled",
      WITHDRAWN: "withdrawn",
    };
    const history = [{ at: at.toISOString(), action: "CREATED" }];
    const documents = { originalLegacyField: "retained in legacy table" };
    await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET LOCAL TIME ZONE 'Europe/Moscow'`;
        await tx.$executeRaw`
      INSERT INTO "User" ("id", "email", "updatedAt")
      VALUES ('owner-a', 'migration-a@example.invalid', ${utcTimestamp}::timestamp(3)),
             ('owner-b', 'migration-b@example.invalid', ${utcTimestamp}::timestamp(3))`;
        await tx.$executeRaw`
      INSERT INTO "Session" ("id", "tokenHash", "userId", "expires")
      VALUES ('legacy-session', 'fixture-token-hash', 'owner-a', ${utcTimestamp}::timestamp(3))`;
        await tx.$executeRaw`
      INSERT INTO "UserStateSnapshot" ("userId", "state", "updatedAt")
      VALUES ('owner-a', ${JSON.stringify(state)}::jsonb, ${utcTimestamp}::timestamp(3))`;
        await tx.$executeRaw`
      INSERT INTO "University" ("id", "slug", "name", "shortName", "websiteUrl", "city", "updatedAt")
      VALUES ('fixture-university', 'fixture-university', 'Synthetic fixture', 'Fixture',
              'https://example.invalid', 'Fixture', ${utcTimestamp}::timestamp(3))`;
        await tx.$executeRaw`
      INSERT INTO "EducationProgram" ("id", "universityId", "slug", "code", "name", "level", "form", "updatedAt")
      VALUES ('database-program-id', 'fixture-university', 'synthetic-program', '00.00.00',
              'Synthetic program', 'BACHELOR', 'FULL_TIME', ${utcTimestamp}::timestamp(3))`;
        for (const [index, status] of Object.keys(stages).entries()) {
          await tx.$executeRaw`
        INSERT INTO "AdmissionTrackerItem"
          ("id", "userId", "programId", "admissionYear", "priority", "status", "stage",
           "deadlineAt", "notes", "documents", "history", "createdAt", "updatedAt")
        VALUES (${`legacy-${status}`}, 'owner-a', 'database-program-id', ${2026 + index},
                ${index === 0 ? null : index + 1}, ${status}, 'Legacy custom stage', ${utcTimestamp}::timestamp(3),
                ${index === 0 ? null : "Personal fixture note"}, ${JSON.stringify(documents)}::jsonb,
                ${JSON.stringify(history)}::jsonb, ${utcTimestamp}::timestamp(3), ${utcTimestamp}::timestamp(3))`;
        }
        await tx.$executeRaw`
      INSERT INTO "AdmissionTrackerItem"
        ("id", "userId", "programId", "admissionYear", "status", "stage", "history", "createdAt", "updatedAt")
      VALUES ('other-owner', 'owner-b', 'database-program-id', 2026, 'PLANNING', 'Legacy stage',
              '[]'::jsonb, ${utcTimestamp}::timestamp(3), ${utcTimestamp}::timestamp(3))`;

        await apply(accountMigration, tx);
        const [{ createdAt, now }] = await tx.$queryRaw`
      INSERT INTO "AccountTrackerItem" ("id", "userId", "programKey", "admissionYear", "history", "updatedAt")
      VALUES ('new-tracker-item', 'owner-b', 'synthetic-program', 2027, '[]'::jsonb, ${utcTimestamp}::timestamp(3))
      RETURNING "createdAt", CURRENT_TIMESTAMP::timestamptz(3) AS now`;
        assert.equal(createdAt.toISOString(), now.toISOString());
        await tx.accountTrackerItem.delete({
          where: { id: "new-tracker-item" },
        });
      },
      { timeout: 60_000 },
    );

    const session = await db.session.findUniqueOrThrow({
      where: { id: "legacy-session" },
    });
    assert.equal(session.userId, "owner-a");
    assert.equal(session.authVersion, 0);
    assert.equal(session.expires.toISOString(), at.toISOString());
    const rows = await db.accountTrackerItem.findMany({
      where: { userId: "owner-a" },
      orderBy: { admissionYear: "asc" },
    });
    assert.equal(rows.length, Object.keys(stages).length);
    for (const [index, [status, stage]] of Object.entries(stages).entries()) {
      const row = rows[index];
      assert.equal(row.id, `legacy-${status}`);
      assert.equal(row.programKey, "synthetic-program");
      assert.equal(row.admissionYear, 2026 + index);
      assert.equal(row.priority, index === 0 ? 1 : index + 1);
      assert.equal(row.stage, stage);
      assert.equal(
        row.documentsReady,
        status === "DOCUMENTS_READY",
        `document readiness for ${status}`,
      );
      assert.equal(row.consentReady, false);
      assert.equal(row.notes, index === 0 ? "" : "Personal fixture note");
      assert.deepEqual(row.history, history);
      assert.equal(row.deadlineAt.toISOString(), at.toISOString());
      assert.equal(row.createdAt.toISOString(), at.toISOString());
      assert.equal(row.updatedAt.toISOString(), at.toISOString());
      assert.equal(row.version, 1);
    }
    const legacy = await db.admissionTrackerItem.findUniqueOrThrow({
      where: { id: "legacy-DOCUMENTS_READY" },
    });
    assert.deepEqual(legacy.documents, documents);
    assert.equal(legacy.stage, "Legacy custom stage");
    assert.equal(
      await db.accountTrackerItem.count({ where: { userId: "owner-b" } }),
      1,
    );
    const snapshot = await db.userStateSnapshot.findUniqueOrThrow({
      where: { userId: "owner-a" },
    });
    assert.deepEqual(snapshot.state, state);
    assert.equal(snapshot.version, 0);
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { id: "owner-a" } }))
        .authVersion,
      0,
    );

    await db.educationProgram.delete({ where: { id: "database-program-id" } });
    assert.equal(
      await db.accountTrackerItem.count(),
      7,
      "new tracker records survive removal of the legacy program",
    );
  } finally {
    try {
      if (created)
        await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    } finally {
      await db.$disconnect();
    }
  }
});
