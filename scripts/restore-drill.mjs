import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rmdir, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";

const root = fileURLToPath(new URL("../", import.meta.url));
const major = 16;
class DrillError extends Error {}

export function parseRestoreTarget(value) {
  try {
    const url = new URL(value);
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      url.hostname !== "127.0.0.1" ||
      !/^\/[a-z][a-z0-9_]{0,57}_test$/.test(url.pathname) ||
      !url.port ||
      Number(url.port) < 1 ||
      Number(url.port) > 65535 ||
      !url.username ||
      !url.password ||
      url.hash ||
      [...url.searchParams].some(
        ([key, item]) => key !== "schema" || item !== "public",
      ) ||
      url.searchParams.getAll("schema").length > 1
    )
      throw new Error();
    const username = decodeURIComponent(url.username);
    const password = decodeURIComponent(url.password);
    if (/[\u0000-\u001f\u007f]/.test(username + password)) throw new Error();
    return { url, username, password, database: url.pathname.slice(1) };
  } catch {
    throw new DrillError(
      "TEST_DATABASE_URL must identify a dedicated local 127.0.0.1 PostgreSQL database ending in _test, with an explicit port and credentials",
    );
  }
}

function execute(label, file, args, env, timeout = 90_000) {
  try {
    return execFileSync(file, args, {
      cwd: root,
      encoding: "utf8",
      env,
      stdio: ["ignore", "pipe", "pipe"],
      timeout,
      windowsHide: true,
    });
  } catch (error) {
    // Tool diagnostics can include connection strings. Return only safe labels.
    const reason =
      error.code === "ENOENT"
        ? "executable missing"
        : error.code === "ETIMEDOUT"
          ? "timed out"
          : "command failed";
    throw new DrillError(`${label}: ${reason}`);
  }
}

function requireCheck(result, label) {
  if (!result) throw new DrillError(label);
}

function fingerprint(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function seed(db, { baselineCatalog, stageCatalog, reviewCatalog }) {
  const source = baselineCatalog();
  const program = source.programs[0];
  const forUniversity = (row) => row.universitySlug === program.universitySlug;
  const snapshot = {
    schemaVersion: source.schemaVersion,
    programs: [program],
    universities: source.universities.filter(
      (row) => row.slug === program.universitySlug,
    ),
    universityFacts: source.universityFacts.filter(forUniversity),
    directoryDetails: source.directoryDetails.filter(forUniversity),
    admissionCampaigns: source.admissionCampaigns.filter(forUniversity),
  };
  const actor = { id: "restore-editor", role: "ADMIN" };
  const userId = "restore-applicant";
  await db.user.createMany({
    data: [
      { ...actor, email: "restore-editor@example.invalid" },
      {
        id: userId,
        email: "restore-applicant@example.invalid",
        authVersion: 2,
      },
    ],
  });
  const options = {
    actor,
    expectedRevisionId: null,
    reason: "Изолированная проверка восстановления",
  };
  const revision = await stageCatalog(db, snapshot, options);
  await reviewCatalog(db, revision.id, "publish", options);

  await db.$transaction(async (tx) => {
    await tx.accountTrackerItem.create({
      data: {
        id: "restore-tracker",
        userId,
        programKey: program.slug,
        admissionYear: program.trust.dataYear,
        notes: "Фикстура до резервной копии",
        history: [],
        documentsReady: true,
        consentReady: false,
        version: 3,
      },
    });
    const product = await tx.product.create({
      data: {
        code: "restore-fixture",
        name: "Restore fixture",
        price: 100,
        features: [],
      },
    });
    const subscription = await tx.subscription.create({
      data: {
        userId,
        productId: product.id,
        provider: "fixture",
        planCode: product.code,
        status: "ACTIVE",
      },
    });
    await tx.payment.create({
      data: {
        id: "restore-payment",
        userId,
        productId: product.id,
        subscriptionId: subscription.id,
        idempotencyKey: "restore-payment-once",
        amount: 100,
        status: "SUCCEEDED",
        providerEnvironment: "fixture",
        needsReview: false,
        grant: {
          create: {
            subscriptionId: subscription.id,
            entitlementKeys: ["restore-fixture"],
          },
        },
        operations: {
          create: {
            kind: "INIT",
            idempotencyKey: "restore-init-once",
            state: "SUCCEEDED",
          },
        },
      },
    });
  });
}

async function snapshotFingerprint(
  db,
  { readPublishedCatalog, catalogChecksum },
  migrationNames,
) {
  const publication = await readPublishedCatalog(db);
  const tracker = await db.accountTrackerItem.findUniqueOrThrow({
    where: { id: "restore-tracker" },
    include: { user: { select: { authVersion: true } } },
  });
  const payment = await db.payment.findUniqueOrThrow({
    where: { id: "restore-payment" },
    include: { grant: true, subscription: true, operations: true },
  });
  const migrations = await db.$queryRaw`
    SELECT migration_name, checksum, finished_at::text, rolled_back_at::text
    FROM "_prisma_migrations" ORDER BY migration_name`;
  requireCheck(
    JSON.stringify(migrations.map((row) => row.migration_name)) ===
      JSON.stringify(migrationNames) &&
      migrations.every(
        (row) =>
          row.finished_at &&
          !row.rolled_back_at &&
          /^[a-f0-9]{64}$/.test(row.checksum),
      ),
    "Migration ledger does not match the checked-out migrations",
  );
  const publishedCount = await db.auditLog.count({
    where: { action: "CATALOG_PUBLISHED" },
  });
  requireCheck(
    publishedCount === 1 &&
      publication.snapshot.programs.length === 1 &&
      publication.snapshot.programs[0].slug === tracker.programKey &&
      tracker.user.authVersion === 2 &&
      tracker.documentsReady &&
      !tracker.consentReady &&
      payment.status === "SUCCEEDED" &&
      payment.userId === tracker.userId &&
      payment.amount === 100 &&
      payment.currency === "RUB" &&
      payment.subscription?.status === "ACTIVE" &&
      payment.grant?.subscriptionId === payment.subscriptionId &&
      !payment.grant?.revokedAt &&
      payment.operations.length === 1 &&
      payment.operations[0].state === "SUCCEEDED",
    "Restored catalog, tracker or payment relationships failed verification",
  );
  return catalogChecksum(
    JSON.parse(JSON.stringify({ publication, tracker, payment, migrations })),
  );
}

async function drill() {
  const target = parseRestoreTarget(process.env.TEST_DATABASE_URL);
  const scope = `restore_drill_${randomUUID().replaceAll("-", "")}`;
  const pgBin = process.env.RESTORE_DRILL_PG_BIN;
  requireCheck(
    !pgBin || isAbsolute(pgBin),
    "RESTORE_DRILL_PG_BIN must be an absolute directory",
  );
  const binary = (name) => {
    const file = `${name}${process.platform === "win32" ? ".exe" : ""}`;
    return pgBin ? join(pgBin, file) : file;
  };
  const commandEnv = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !/^PG/i.test(key)),
  );
  const cliEnv = {
    ...commandEnv,
    PGUSER: target.username,
    PGPASSWORD: target.password,
    PGHOSTADDR: "127.0.0.1",
    PGHOST: "127.0.0.1",
    PGPORT: target.url.port,
    PGDATABASE: target.database,
    PGCONNECT_TIMEOUT: "5",
    PGCLIENTENCODING: "UTF8",
    PGSSLMODE: "disable",
  };
  for (const tool of ["pg_dump", "pg_restore"]) {
    const version = execute(
      `${tool} version check`,
      binary(tool),
      ["--version"],
      cliEnv,
      5000,
    );
    requireCheck(
      new RegExp(`\\(PostgreSQL\\) ${major}(?:\\.|\\s|$)`).test(version),
      `${tool} must be PostgreSQL ${major}`,
    );
  }
  const migrationNames = (
    await readdir(join(root, "prisma", "migrations"), { withFileTypes: true })
  )
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const scopedUrl = new URL(target.url);
  scopedUrl.searchParams.set("schema", scope);
  const migrate = () =>
    execute(
      "Prisma migration deploy",
      process.execPath,
      ["node_modules/prisma/build/index.js", "migrate", "deploy"],
      { ...commandEnv, DATABASE_URL: scopedUrl.href },
    );
  const control = new PrismaClient({
    datasources: { db: { url: target.url.href } },
  });
  const db = new PrismaClient({ datasources: { db: { url: scopedUrl.href } } });
  let ownsSchema = false;
  let directory;
  let report;
  let phase = "checking the database connection";
  try {
    const [actual] = await control.$queryRaw`
      SELECT current_database()::text AS database, current_user::text AS username,
             current_setting('server_encoding') AS encoding,
             current_setting('TimeZone') AS timezone,
             current_setting('server_version_num')::int AS version`;
    requireCheck(
      actual.database === target.database &&
        actual.username === target.username &&
        actual.encoding === "UTF8" &&
        ["UTC", "Etc/UTC"].includes(actual.timezone) &&
        Math.floor(actual.version / 10_000) === major,
      "Connected database must be the expected dedicated PostgreSQL 16 loopback database in UTF8/UTC",
    );

    // The sole destructive target is this script-generated schema. Successful
    // creation proves ownership before any cleanup can use the identifier.
    phase = "creating the owned test schema";
    await control.$executeRawUnsafe(`CREATE SCHEMA "${scope}"`);
    ownsSchema = true;
    migrate();
    const [{ baselineCatalog }, service, { catalogChecksum }] =
      await Promise.all([
        import("../lib/catalog/baseline.ts"),
        import("../lib/catalog/service.ts"),
        import("../lib/catalog/diff.ts"),
      ]);
    const catalog = { baselineCatalog, catalogChecksum, ...service };
    phase = "preparing and verifying the fixture";
    await seed(db, catalog);
    const before = await snapshotFingerprint(db, catalog, migrationNames);
    directory = await mkdtemp(join(tmpdir(), "postupai-restore-drill-"));
    const archive = join(directory, "fixture.dump");
    phase = "creating the fixture archive";
    const backupStartedAt = new Date();
    const backupStarted = performance.now();
    execute(
      "Fixture backup",
      binary("pg_dump"),
      [
        "--no-password",
        "--format=custom",
        "--schema",
        scope,
        "--strict-names",
        "--no-owner",
        "--no-acl",
        "--lock-wait-timeout=5s",
        "--file",
        archive,
      ],
      cliEnv,
    );
    const backupMs = Math.round(performance.now() - backupStarted);
    const backupCompletedAt = new Date();
    const bytes = await readFile(archive);
    requireCheck(
      bytes.subarray(0, 5).toString() === "PGDMP",
      "Expected a PostgreSQL custom archive",
    );
    const archiveSha256 = fingerprint(bytes);

    phase = "recording the post-backup marker";
    await db.accountTrackerItem.update({
      where: { id: "restore-tracker" },
      data: {
        notes: "Маркер после резервной копии",
        version: { increment: 1 },
      },
    });
    requireCheck(
      (await snapshotFingerprint(db, catalog, migrationNames)) !== before,
      "Post-backup marker did not change the fixture",
    );
    await db.$disconnect();
    const simulatedLossAt = new Date();
    const recoveryStarted = performance.now();
    phase = "restoring the owned test schema";
    await control.$executeRawUnsafe(`DROP SCHEMA "${scope}" CASCADE`);
    execute(
      "Fixture restore",
      binary("pg_restore"),
      [
        "--no-password",
        "--dbname",
        target.database,
        "--single-transaction",
        "--no-owner",
        "--no-acl",
        archive,
      ],
      cliEnv,
    );
    const databaseRecoveryMs = Math.round(performance.now() - recoveryStarted);
    const migrationStarted = performance.now();
    migrate();
    const migrationVerificationMs = Math.round(
      performance.now() - migrationStarted,
    );
    phase = "checking the restored application data";
    const restored = await snapshotFingerprint(db, catalog, migrationNames);
    requireCheck(
      restored === before,
      "Restored fixture differs from the pre-backup state",
    );
    let immutable = false;
    try {
      await db.catalogRevision.updateMany({
        where: { status: "PUBLISHED" },
        data: { checksum: "fixture-tamper" },
      });
    } catch (error) {
      immutable =
        error instanceof Error &&
        error.message.includes("Catalog revisions are immutable");
    }
    requireCheck(
      immutable,
      "Restored catalog immutability trigger did not reject a write",
    );
    report = {
      status: "passed",
      fixture: "isolated_logical_restore",
      backupStartedAt: backupStartedAt.toISOString(),
      backupCompletedAt: backupCompletedAt.toISOString(),
      simulatedLossAt: simulatedLossAt.toISOString(),
      archiveBytes: bytes.byteLength,
      archiveSha256,
      backupMs,
      snapshotAgeUpperBoundMs: Math.round(recoveryStarted - backupStarted),
      databaseRecoveryMs,
      migrationVerificationMs,
      drillRecoveryMs: Math.round(performance.now() - recoveryStarted),
      migrationsChecked: migrationNames.length,
      postBackupMarkerExcluded: true,
    };
  } catch (error) {
    if (error instanceof DrillError) throw error;
    const prismaCode =
      typeof error?.code === "string" && /^P\d{4}$/.test(error.code)
        ? ` (${error.code})`
        : "";
    throw new DrillError(`Error while ${phase}${prismaCode}`);
  } finally {
    try {
      try {
        await db.$disconnect();
      } finally {
        if (ownsSchema) {
          try {
            await control.$executeRawUnsafe(
              `DROP SCHEMA IF EXISTS "${scope}" CASCADE`,
            );
          } catch {
            throw new DrillError(`Could not remove owned test schema ${scope}`);
          }
        }
      }
    } finally {
      try {
        await control.$disconnect();
      } finally {
        if (directory) {
          await unlink(join(directory, "fixture.dump")).catch((error) => {
            if (error.code !== "ENOENT") throw error;
          });
          await rmdir(directory);
        }
      }
    }
  }
  return report;
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    console.log(JSON.stringify(await drill(), null, 2));
  } catch (error) {
    // Only our validation/operation labels are safe to emit. Prisma, URL and
    // filesystem exceptions can contain credentials or absolute private paths.
    console.error(
      `Restore drill failed${error instanceof DrillError ? `: ${error.message}` : ""}`,
    );
    process.exitCode = 1;
  }
}
