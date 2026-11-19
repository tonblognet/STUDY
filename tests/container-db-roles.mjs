import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { baselineCatalog } from "../lib/catalog/baseline.ts";
import { reviewCatalog, stageCatalog } from "../lib/catalog/service.ts";
import { runDeadlineTick } from "../lib/operations/deadline-worker.ts";
import { databaseReady } from "../lib/operations/readiness.ts";

function roleUrl(role) {
  const key = `ROLE_FIXTURE_${role.toUpperCase()}_URL`;
  let url;
  try {
    url = new URL(process.env[key]);
  } catch {
    throw new Error(`${key} must name the isolated container database`);
  }
  assert.ok(
    url.protocol === "postgresql:" &&
      url.username === `ci_role_${role}` &&
      url.hostname === "127.0.0.1" &&
      url.port === "5432" &&
      url.pathname === "/postupai_container_test" &&
      url.search === "?schema=postupai_roles" &&
      !url.hash,
    `${key} must name the isolated container database`,
  );
  return url.href;
}

const roles = ["web", "worker", "operator"];
const urls = Object.fromEntries(roles.map((role) => [role, roleUrl(role)]));
const clients = Object.fromEntries(
  roles.map((role) => [role, new PrismaClient({ datasourceUrl: urls[role] })]),
);
const { web, worker, operator } = clients;

async function checkRole(db, role) {
  const [row] = await db.$queryRaw`
    SELECT current_user::text AS identity,
           (rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls) AS elevated,
           EXISTS (SELECT 1 FROM pg_auth_members WHERE member = pg_roles.oid) AS membership,
           has_schema_privilege(current_user, 'postupai_roles', 'USAGE') AS schema_usage,
           has_schema_privilege(current_user, 'postupai_roles', 'CREATE') AS schema_create,
           has_schema_privilege(current_user, 'public', 'CREATE') AS public_create,
           has_database_privilege(current_user, current_database(), 'CREATE') AS db_create,
           EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'postupai_roles' AND tableowner = current_user) AS owns_table,
           has_table_privilege(current_user, 'postupai_roles._prisma_migrations', 'SELECT') AS migrations_read,
           has_table_privilege(current_user, 'postupai_roles._prisma_migrations', 'INSERT, UPDATE, DELETE, TRUNCATE') AS migrations_write
    FROM pg_roles WHERE rolname = current_user`;
  assert.deepEqual(row, {
    identity: `ci_role_${role}`,
    elevated: false,
    membership: false,
    schema_usage: true,
    schema_create: false,
    public_create: false,
    db_create: false,
    owns_table: false,
    migrations_read: role === "web",
    migrations_write: false,
  });
}

try {
  for (const role of roles) await checkRole(clients[role], role);
  const [owners] = await web.$queryRaw`
    SELECT n.nspowner::regrole::text AS schema_owner,
           to_regclass('postupai_roles._prisma_migrations') IS NOT NULL AS migration_table,
           NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = n.nspname AND tableowner <> 'ci_role_migrate') AS migration_owns_tables
    FROM pg_namespace n WHERE n.nspname = 'postupai_roles'`;
  assert.deepEqual(owners, {
    schema_owner: "ci_role_migrate",
    migration_table: true,
    migration_owns_tables: true,
  });
  const [workerPermissions] = await worker.$queryRaw`
    SELECT has_column_privilege(current_user, 'postupai_roles."User"', 'passwordHash', 'SELECT') AS reads_password,
           has_column_privilege(current_user, 'postupai_roles."User"', 'role', 'UPDATE') AS changes_role,
           has_table_privilege(current_user, 'postupai_roles."Payment"', 'SELECT, INSERT, UPDATE, DELETE') AS payment_access,
           has_table_privilege(current_user, 'postupai_roles."CatalogRevision"', 'INSERT, UPDATE, DELETE') AS changes_catalog,
           has_table_privilege(current_user, 'postupai_roles."Notification"', 'UPDATE, DELETE') AS rewrites_notifications`;
  assert.ok(
    Object.values(workerPermissions).every((granted) => granted === false),
  );
  const [operatorPermissions] = await operator.$queryRaw`
    SELECT has_column_privilege(current_user, 'postupai_roles."CatalogHead"', 'revisionId', 'UPDATE') AS moves_head,
           has_table_privilege(current_user, 'postupai_roles."CatalogRevision"', 'UPDATE, DELETE') AS changes_revision,
           has_table_privilege(current_user, 'postupai_roles."DeadlineEmailJob"', 'SELECT, INSERT, UPDATE, DELETE') AS queue_access`;
  assert.ok(
    Object.values(operatorPermissions).every((granted) => granted === false),
  );

  assert.equal(await databaseReady(web), false);
  const account = await web.user.create({
    data: {
      email: "role-fixture@example.invalid",
      passwordHash: "fixture-password-hash",
      emailVerified: new Date(),
    },
  });
  const expires = new Date(Date.now() + 60 * 60_000);
  const session = await web.session.create({
    data: { userId: account.id, tokenHash: "fixture-session-hash", expires },
  });
  const challenge = await web.authChallenge.create({
    data: {
      userId: account.id,
      tokenHash: "fixture-challenge-hash",
      type: "email_2fa",
      expiresAt: expires,
    },
  });
  execFileSync(
    process.execPath,
    ["--import", "tsx", "scripts/bootstrap-staff.ts", "--apply"],
    {
      env: {
        ...process.env,
        DATABASE_URL: urls.operator,
        DEPLOYMENT_MODE: "staging",
        BOOTSTRAP_USER_ID: account.id,
      },
      timeout: 25_000,
      stdio: "pipe",
    },
  );
  const actor = await web.user.findUniqueOrThrow({ where: { id: account.id } });
  assert.equal(actor.role, "SUPERADMIN");
  assert.equal(actor.authVersion, 1);
  assert.ok(
    (await web.session.findUniqueOrThrow({ where: { id: session.id } }))
      .revokedAt,
  );
  assert.ok(
    (await web.authChallenge.findUniqueOrThrow({ where: { id: challenge.id } }))
      .usedAt,
  );
  assert.equal(
    await web.auditLog.count({
      where: { action: "BOOTSTRAP_SUPERADMIN", entityId: actor.id },
    }),
    1,
  );

  const baseline = baselineCatalog();
  const [program] = baseline.programs;
  const matchesUniversity = (row) =>
    row.universitySlug === program.universitySlug;
  const snapshot = {
    ...baseline,
    programs: [program],
    universities: baseline.universities.filter(
      (row) => row.slug === program.universitySlug,
    ),
    universityFacts: baseline.universityFacts.filter(matchesUniversity),
    directoryDetails: baseline.directoryDetails.filter(matchesUniversity),
    admissionCampaigns: baseline.admissionCampaigns.filter(matchesUniversity),
  };
  const options = {
    actor,
    expectedRevisionId: null,
    reason: "Изолированная проверка ролей БД",
  };
  const draft = await stageCatalog(operator, snapshot, options);
  assert.equal(draft.status, "REVIEW");
  assert.equal(await databaseReady(web), false);
  await reviewCatalog(web, draft.id, "publish", options);
  assert.equal(await databaseReady(web), true);

  await web.accountTrackerItem.create({
    data: {
      userId: actor.id,
      programKey: program.slug,
      admissionYear: program.trust.dataYear,
      deadlineAt: new Date(Date.now() + 60 * 60_000),
      history: [],
    },
  });
  assert.equal((await runDeadlineTick(worker)).inApp, 1);
  assert.equal((await runDeadlineTick(worker)).inApp, 0);
  assert.equal(
    await web.notification.count({
      where: { userId: actor.id, type: "PERSONAL_DEADLINE" },
    }),
    1,
  );
  assert.ok(
    await worker.workerHeartbeat.findUnique({
      where: { id: "personal_deadlines" },
    }),
  );
  console.log(
    "Container DB roles passed: restricted migration, web, operator and worker logins.",
  );
} finally {
  await Promise.all(Object.values(clients).map((db) => db.$disconnect()));
}
