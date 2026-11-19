import type { PrismaClient } from "@prisma/client";

type Environment = Readonly<Record<string, string | undefined>>;
export const requiredMigration = "20261110010000_deadline_worker";

function origin(value: string | undefined, staging: boolean) {
  try {
    const url = new URL(value ?? "");
    return (
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === "/" &&
      (staging ||
        !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) &&
      (url.protocol === "https:" ||
        (staging &&
          url.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
    );
  } catch {
    return false;
  }
}

/** Only issue codes leave this function; environment values never do. */
export function deploymentIssues(env: Environment = process.env): string[] {
  const issues: string[] = [];
  const staging = env.DEPLOYMENT_MODE === "staging";
  if (!staging && env.DEPLOYMENT_MODE !== "production")
    issues.push("DEPLOYMENT_MODE");
  if (env.CATALOG_STORAGE !== "database") issues.push("CATALOG_STORAGE");
  if (!origin(env.APP_URL, staging)) issues.push("APP_URL");
  if (
    !env.AUTH_SECRET ||
    env.AUTH_SECRET.trim().length < 32 ||
    env.AUTH_SECRET.startsWith("replace-")
  )
    issues.push("AUTH_SECRET");
  try {
    const db = new URL(env.DATABASE_URL ?? "");
    if (
      !["postgres:", "postgresql:"].includes(db.protocol) ||
      !db.hostname ||
      (env.DEPLOYMENT_MODE === "production" &&
        (db.searchParams.getAll("sslmode").join() !== "require" ||
          db.searchParams.getAll("sslaccept").join() !== "strict"))
    )
      issues.push("DATABASE_URL");
  } catch {
    issues.push("DATABASE_URL");
  }
  try {
    const smtp = new URL(env.SMTP_URL ?? "");
    if (
      !["smtp:", "smtps:"].includes(smtp.protocol) ||
      !smtp.hostname ||
      smtp.search ||
      smtp.hash ||
      !["", "/"].includes(smtp.pathname)
    )
      issues.push("SMTP_URL");
  } catch {
    issues.push("SMTP_URL");
  }
  if (
    !env.EMAIL_FROM ||
    env.EMAIL_FROM.length > 320 ||
    /[\r\n]/.test(env.EMAIL_FROM) ||
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(
      env.EMAIL_FROM.match(/<([^<>]+)>$/)?.[1] ?? env.EMAIL_FROM,
    )
  )
    issues.push("EMAIL_FROM");
  if (env.DEPLOYMENT_MODE === "production" && env.TRUST_PROXY !== "true")
    issues.push("TRUST_PROXY");
  return issues;
}

/** Checks schema and publication metadata, not mail delivery or catalog facts. */
export async function databaseReady(
  db: Pick<PrismaClient, "$transaction">,
): Promise<boolean> {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET LOCAL statement_timeout = '2500ms'`;
      const rows = await tx.$queryRaw<Array<{ ready: boolean }>>`
        SELECT (
          EXISTS (
            SELECT 1 FROM "_prisma_migrations"
            WHERE migration_name = ${requiredMigration}
              AND finished_at IS NOT NULL AND rolled_back_at IS NULL
          ) AND NOT EXISTS (
            SELECT 1 FROM "_prisma_migrations"
            WHERE finished_at IS NULL AND rolled_back_at IS NULL
          ) AND EXISTS (
            SELECT 1 FROM "CatalogHead" AS head
            JOIN "CatalogRevision" AS revision ON revision."id" = head."revisionId"
            WHERE head."id" = 'public' AND revision."status" = 'PUBLISHED'
          )
        ) AS ready`;
      return rows[0]?.ready === true;
    },
    { maxWait: 1000, timeout: 3500 },
  );
}
