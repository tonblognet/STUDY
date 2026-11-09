import type { Prisma } from "@prisma/client";
import { prisma } from "@/db";
import { hashToken } from "@/lib/auth/crypto";

// Atomic across workers; database failure never falls back to an unbounded local bucket.
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  db: Pick<Prisma.TransactionClient, "$queryRaw"> = prisma,
) {
  try {
    // resetAt is a timestamp without time zone; store and compare it in UTC.
    const rows = await db.$queryRaw<Array<{ count: number; resetAt: Date }>>`
      INSERT INTO "RateLimitBucket" ("key", "count", "resetAt")
      VALUES (${hashToken(key)}, 1,
        (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + ${windowMs} * INTERVAL '1 millisecond')
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimitBucket"."resetAt" <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
          THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
        "resetAt" = CASE WHEN "RateLimitBucket"."resetAt" <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
          THEN EXCLUDED."resetAt" ELSE "RateLimitBucket"."resetAt" END
      RETURNING "count", "resetAt"`;
    const bucket = rows[0];
    return {
      allowed: bucket.count <= limit,
      remaining: Math.max(0, limit - bucket.count),
      resetAt: bucket.resetAt.getTime(),
    };
  } catch {
    return { allowed: false, remaining: 0, resetAt: Date.now() + windowMs };
  }
}
