import { Prisma } from "@prisma/client";
import { resolveTrackerProgramKey } from "@/lib/account/tracker-program";

export const deadlineWindowMs = 7 * 86400000;
export const deadlineReminderKey = Prisma.sql`encode(sha256(convert_to(
  item."userId" || ':' || item."id" || ':' ||
  to_char(item."deadlineAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'UTF8'
)), 'hex')`;
export const eligibleDeadline = Prisma.sql`item."stage" NOT IN ('enrolled', 'withdrawn')`;

export function utcTimestamp(value: Date) {
  return value.toISOString().slice(0, -1);
}

type ProgramLabel = {
  id: string;
  slug: string;
  universityShort: string;
  title: string;
};

/** Caller holds the User row lock, shared with tracker and preference writes. */
export async function materializeDeadlineNotifications(
  tx: Prisma.TransactionClient,
  userId: string,
  programs: readonly ProgramLabel[],
  now = new Date(),
) {
  const preference = await tx.notificationPreference.findUnique({
    where: { userId },
    select: { inAppEnabled: true, deadlines: true },
  });
  if (preference && (!preference.inAppEnabled || !preference.deadlines))
    return { enabled: false, created: 0 };

  const due = await tx.$queryRaw<
    Array<{
      notificationId: string;
      programKey: string;
      admissionYear: number;
      deadlineAt: Date;
    }>
  >`
    SELECT reminder."notificationId", item."programKey",
           item."admissionYear", item."deadlineAt"
    FROM "AccountTrackerItem" AS item
    CROSS JOIN LATERAL (SELECT ${deadlineReminderKey} AS "notificationId") AS reminder
    WHERE item."userId" = ${userId}
      AND item."deadlineAt" <= ${utcTimestamp(new Date(now.getTime() + deadlineWindowMs))}::timestamp(3)
      AND ${eligibleDeadline}
      AND NOT EXISTS (
        SELECT 1 FROM "Notification" AS notice
        WHERE notice."userId" = item."userId" AND notice."id" = reminder."notificationId"
      )
    ORDER BY item."deadlineAt", item."id"
    LIMIT 200`;
  if (!due.length) return { enabled: true, created: 0 };

  const result = await tx.notification.createMany({
    skipDuplicates: true,
    data: due.map((item) => {
      const program = resolveTrackerProgramKey(item.programKey, programs);
      const name = program
        ? `${program.universityShort} · ${program.title}`
        : "Программа из вашего трекера";
      return {
        id: item.notificationId,
        userId,
        type: "PERSONAL_DEADLINE",
        title: "Личный срок в трекере",
        body: `${name} · ${item.admissionYear}: ${item.deadlineAt.toLocaleDateString("ru-RU", { timeZone: "UTC" })}. Срок задан вами; проверьте условия на сайте вуза.`,
      };
    }),
  });
  return { enabled: true, created: result.count };
}
