import type { DeadlineEmailJob, Prisma, PrismaClient } from "@prisma/client";
import { readPublishedCatalog } from "@/lib/catalog/service";
import type { EmailProvider } from "@/lib/notifications/email";
import {
  deadlineReminderKey,
  deadlineWindowMs,
  eligibleDeadline,
  materializeDeadlineNotifications,
  utcTimestamp,
} from "@/lib/notifications/deadline-reminders";

const maxAttempts = 4;
const leaseMs = 15 * 60_000;
const batch = 20;
const workerId = "personal_deadlines";

type Delivery = { provider: EmailProvider; appOrigin: string };

async function runInApp(db: PrismaClient, now: Date) {
  const dueBy = utcTimestamp(new Date(now.getTime() + deadlineWindowMs));
  const owners = await db.$queryRaw<Array<{ userId: string }>>`
    SELECT item."userId" FROM "AccountTrackerItem" AS item
    LEFT JOIN "NotificationPreference" AS pref ON pref."userId" = item."userId"
    WHERE item."deadlineAt" <= ${dueBy}::timestamp(3) AND ${eligibleDeadline}
      AND COALESCE(pref."inAppEnabled", true) AND COALESCE(pref."deadlines", true)
      AND NOT EXISTS (SELECT 1 FROM "Notification" AS notice WHERE notice."id" = ${deadlineReminderKey})
    GROUP BY item."userId" ORDER BY MIN(item."deadlineAt"), item."userId"
    LIMIT ${batch}`;
  if (!owners.length) return 0;
  const { snapshot } = await readPublishedCatalog(db);
  let created = 0;
  for (const { userId } of owners) {
    created += await db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
      if (!locked.length) return 0;
      return (
        await materializeDeadlineNotifications(
          tx,
          userId,
          snapshot.programs,
          now,
        )
      ).created;
    });
  }
  return created;
}

async function enqueueEmail(db: PrismaClient, now: Date) {
  // Eligibility is rechecked under the owner lock at dispatch. This insert
  // only records intent and stores no recipient or body.
  const end = utcTimestamp(new Date(now.getTime() + deadlineWindowMs));
  const start = utcTimestamp(now);
  return db.$transaction(async (tx) => {
    const [lock] = await tx.$queryRaw<Array<{ acquired: boolean }>>`
      SELECT pg_try_advisory_xact_lock(hashtext('postupai:deadline-email-enqueue')) AS acquired`;
    if (!lock?.acquired) return 0;
    return tx.$executeRaw`
      INSERT INTO "DeadlineEmailJob" ("id", "userId", "trackerItemId", "deadlineAt", "availableAt")
      SELECT ${deadlineReminderKey}, item."userId", item."id", item."deadlineAt", ${start}::timestamp(3)
      FROM "AccountTrackerItem" AS item
      JOIN "NotificationPreference" AS pref ON pref."userId" = item."userId"
      JOIN "User" AS owner ON owner."id" = item."userId"
      WHERE pref."deadlineEmailEnabled" AND owner."emailVerified" IS NOT NULL
        AND ${eligibleDeadline}
        AND item."deadlineAt" > ${start}::timestamp(3) AND item."deadlineAt" <= ${end}::timestamp(3)
        AND NOT EXISTS (
          SELECT 1 FROM "DeadlineEmailJob" AS job
          WHERE job."id" = ${deadlineReminderKey} AND job."state" <> 'CANCELLED'
        )
      ORDER BY item."deadlineAt", item."id" LIMIT 100
      ON CONFLICT ("id") DO UPDATE SET
        "state" = 'PENDING', "availableAt" = EXCLUDED."availableAt", "resultCode" = NULL
      WHERE "DeadlineEmailJob"."state" = 'CANCELLED'`;
  });
}

async function claim(db: PrismaClient, hint: DeadlineEmailJob, now: Date) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${hint.userId} FOR UPDATE`;
    const job = await tx.deadlineEmailJob.findUnique({
      where: { id: hint.id },
    });
    if (!job || job.state !== "PENDING" || job.availableAt > now) return null;
    return tx.deadlineEmailJob.update({
      where: { id: job.id },
      data: {
        state: "SENDING",
        attempts: { increment: 1 },
        leaseUntil: new Date(now.getTime() + leaseMs),
        resultCode: null,
      },
    });
  });
}

async function eligibleRecipient(
  tx: Prisma.TransactionClient,
  job: DeadlineEmailJob,
  now: Date,
) {
  const user = await tx.user.findUnique({
    where: { id: job.userId },
    select: {
      email: true,
      emailVerified: true,
      notificationPreference: { select: { deadlineEmailEnabled: true } },
    },
  });
  if (
    !user?.emailVerified ||
    !user.notificationPreference?.deadlineEmailEnabled
  )
    return null;
  const tracker = await tx.accountTrackerItem.findUnique({
    where: { id: job.trackerItemId },
    select: { userId: true, stage: true, deadlineAt: true },
  });
  if (
    tracker?.userId !== job.userId ||
    tracker.deadlineAt?.getTime() !== job.deadlineAt.getTime() ||
    job.deadlineAt <= now ||
    ["enrolled", "withdrawn"].includes(tracker.stage)
  )
    return null;
  return user.email;
}

export function smtpOutcome(error: unknown) {
  const response =
    error && typeof error === "object" && "responseCode" in error
      ? error.responseCode
      : undefined;
  if (typeof response !== "number" || !Number.isInteger(response))
    return "UNKNOWN";
  if (response >= 400 && response < 500) return "RETRY";
  if (response >= 500 && response < 600) return "FAILED";
  return "UNKNOWN";
}

/** The claim is durable before this function. Only start the provider call while
 * the owner lock still orders it against consent and tracker changes. */
export async function dispatchClaimedDeadlineEmail(
  db: PrismaClient,
  job: DeadlineEmailJob,
  delivery: Delivery,
  signal?: AbortSignal,
) {
  const dispatch = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${job.userId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "DeadlineEmailJob" WHERE "id" = ${job.id} FOR UPDATE`;
    const current = await tx.deadlineEmailJob.findUnique({
      where: { id: job.id },
    });
    const now = new Date();
    if (
      current?.state !== "SENDING" ||
      current.resultCode ||
      !current.leaseUntil ||
      current.leaseUntil <= now ||
      current.leaseUntil.getTime() !== job.leaseUntil?.getTime()
    )
      return null;
    const email = await eligibleRecipient(tx, current, now);
    if (!email || signal?.aborted) {
      await tx.deadlineEmailJob.update({
        where: { id: job.id },
        data: {
          state: "CANCELLED",
          leaseUntil: null,
          attempts: { decrement: 1 },
        },
      });
      return null;
    }
    await tx.deadlineEmailJob.update({
      where: { id: job.id },
      data: { resultCode: "DISPATCH_STARTED" },
    });
    const date = job.deadlineAt.toLocaleDateString("ru-RU", {
      timeZone: "UTC",
    });
    // Wrap the promise so the DB transaction does not await network settlement.
    const completion = (async () => {
      try {
        await delivery.provider.send({
          to: email,
          subject: "Личный срок в трекере Поступай",
          text: `В трекере указан личный срок ${date}. Проверьте его и официальные условия вуза: ${delivery.appOrigin}/account#tracker`,
          messageId: `<deadline-${job.id}@${new URL(delivery.appOrigin).hostname}>`,
        });
        return "SENT" as const;
      } catch (error) {
        return smtpOutcome(error);
      }
    })();
    return { completion };
  });
  if (!dispatch) return null;
  const outcome = await dispatch.completion;
  const retry = outcome === "RETRY" && job.attempts < maxAttempts;
  const state = retry ? "PENDING" : outcome === "RETRY" ? "FAILED" : outcome;
  const completed = await db.deadlineEmailJob.updateMany({
    where: { id: job.id, state: "SENDING", leaseUntil: job.leaseUntil },
    data: {
      state,
      leaseUntil: null,
      resultCode: outcome === "RETRY" ? "SMTP_TEMPORARY" : outcome,
      ...(retry
        ? {
            availableAt: new Date(
              Date.now() + 60_000 * 5 ** (job.attempts - 1),
            ),
          }
        : {}),
    },
  });
  return completed.count ? state : null;
}

async function deliver(
  db: PrismaClient,
  delivery: Delivery,
  now: Date,
  signal?: AbortSignal,
) {
  const expired = await db.deadlineEmailJob.updateMany({
    where: { state: "SENDING", leaseUntil: { lte: now } },
    data: { state: "UNKNOWN", leaseUntil: null, resultCode: "LEASE_EXPIRED" },
  });
  const jobs = await db.deadlineEmailJob.findMany({
    where: { state: "PENDING", availableAt: { lte: now } },
    orderBy: [{ availableAt: "asc" }, { id: "asc" }],
    take: batch,
  });
  const counts = { sent: 0, deferred: 0, failed: 0, unknown: expired.count };
  for (const hint of jobs) {
    if (signal?.aborted) break;
    const job = await claim(db, hint, new Date());
    if (!job) continue;
    const state = await dispatchClaimedDeadlineEmail(db, job, delivery, signal);
    if (state === "SENT") counts.sent++;
    else if (state === "PENDING") counts.deferred++;
    else if (state === "FAILED") counts.failed++;
    else if (state === "UNKNOWN") counts.unknown++;
  }
  return counts;
}

export async function runDeadlineTick(
  db: PrismaClient,
  delivery?: Delivery,
  signal?: AbortSignal,
) {
  const now = new Date();
  const inApp = await runInApp(db, now);
  const emailQueued = delivery ? await enqueueEmail(db, now) : 0;
  const email = delivery ? await deliver(db, delivery, now, signal) : null;
  const result = { inApp, emailQueued, email };
  const finishedAt = new Date();
  await db.workerHeartbeat.upsert({
    where: { id: workerId },
    create: { id: workerId, finishedAt, counts: result },
    update: { finishedAt, counts: result },
  });
  return result;
}
