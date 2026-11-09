import { readBoundedJson } from "@/lib/security/body";
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/db";
import { getActiveSession } from "@/lib/auth/session";
import { withActiveSession } from "@/lib/auth/session-access";
import { hasValidOrigin } from "@/lib/security/request";
import { getCatalog } from "@/lib/catalog/server";
import { resolveTrackerProgramKey } from "@/lib/account/tracker-program";

async function remindersEnabled(
  db: Pick<Prisma.TransactionClient, "notificationPreference">,
  userId: string,
) {
  const preference = await db.notificationPreference.findUnique({
    where: { userId },
  });
  return (preference?.inAppEnabled ?? true) && (preference?.deadlines ?? true);
}

export async function GET(request: Request) {
  const access = await getActiveSession();
  const user = access?.user;
  if (user && request.headers.get("x-account-id") !== user.id)
    return NextResponse.json(
      { error: "Аккаунт в другой вкладке изменился. Перезагрузите страницу" },
      { status: 409 },
    );
  if (!access || !user)
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  let enabled = await remindersEnabled(prisma, user.id);
  const dueFilter: Prisma.AccountTrackerItemWhereInput = {
    userId: user.id,
    deadlineAt: { lte: new Date(Date.now() + 7 * 86400000) },
    stage: { notIn: ["enrolled", "withdrawn"] },
  };
  if (
    enabled &&
    (await prisma.accountTrackerItem.findFirst({
      where: dueFilter,
      select: { id: true },
    }))
  ) {
    const { programs } = await getCatalog();
    const refreshed = await withActiveSession(access, async (tx) => {
      // Tracker and preference writes share the owner lock with reminder creation.
      if (!(await remindersEnabled(tx, user.id))) return false;
      const dueByUtc = new Date(Date.now() + 7 * 86400000)
        .toISOString()
        .slice(0, -1);
      // Exclude reminders already persisted before limiting the batch. Migrated
      // owners may have more than the new 200-item creation limit. The timestamp
      // column stores UTC milliseconds; use the same ISO spelling as hashToken.
      // PostgreSQL's built-in sha256 needs no optional database extension.
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
        CROSS JOIN LATERAL (
          SELECT encode(sha256(convert_to(
            item."userId" || ':' || item."id" || ':' ||
            to_char(item."deadlineAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'UTF8'
          )), 'hex') AS "notificationId"
        ) AS reminder
        WHERE item."userId" = ${user.id}
          AND item."deadlineAt" <= ${dueByUtc}::timestamp(3)
          AND item."stage" NOT IN ('enrolled', 'withdrawn')
          AND NOT EXISTS (
            SELECT 1 FROM "Notification" AS notice
            WHERE notice."userId" = item."userId"
              AND notice."id" = reminder."notificationId"
          )
        ORDER BY item."deadlineAt", item."id"
        LIMIT 200`;
      if (due.length)
        await tx.notification.createMany({
          skipDuplicates: true,
          data: due.map((item) => {
            const program = resolveTrackerProgramKey(item.programKey, programs);
            const name = program
              ? `${program.universityShort} · ${program.title}`
              : "Программа из вашего трекера";
            return {
              id: item.notificationId,
              userId: user.id,
              type: "PERSONAL_DEADLINE",
              title: "Личный срок в трекере",
              body: `${name} · ${item.admissionYear}: ${item.deadlineAt.toLocaleDateString("ru-RU", { timeZone: "UTC" })}. Срок задан вами; проверьте условия на сайте вуза.`,
            };
          }),
        });
      return true;
    });
    if (!refreshed)
      return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
    enabled = refreshed.value;
  }
  const items = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ enabled, items });
}
const updateSchema = z.union([
  z.object({ enabled: z.boolean() }),
  z.object({ readId: z.string().min(1).max(100) }),
]);
export async function PATCH(request: Request) {
  if (!hasValidOrigin(request))
    return NextResponse.json(
      { error: "Некорректный источник запроса" },
      { status: 403 },
    );
  const access = await getActiveSession();
  const user = access?.user;
  if (user && request.headers.get("x-account-id") !== user.id)
    return NextResponse.json(
      { error: "Аккаунт в другой вкладке изменился. Перезагрузите страницу" },
      { status: 409 },
    );
  if (!access || !user)
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  const parsed = updateSchema.safeParse(
    await readBoundedJson(request).catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json({ error: "Проверьте настройки" }, { status: 400 });
  const data = parsed.data;
  const saved = await withActiveSession(access, async (tx) => {
    if ("enabled" in data) {
      await tx.notificationPreference.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          inAppEnabled: data.enabled,
          deadlines: data.enabled,
        },
        update: { inAppEnabled: data.enabled, deadlines: data.enabled },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "UPDATE_NOTIFICATION_PREFERENCE",
          entityType: "NOTIFICATION_PREFERENCE",
          entityId: user.id,
        },
      });
      return true;
    }
    const changed = await tx.notification.updateMany({
      where: { id: data.readId, userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return changed.count > 0;
  });
  if (!saved)
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  if (!saved.value)
    return NextResponse.json(
      { error: "Уведомление не найдено или уже прочитано" },
      { status: 404 },
    );
  return NextResponse.json({ ok: true });
}
