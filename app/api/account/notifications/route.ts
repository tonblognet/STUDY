import { readBoundedJson } from "@/lib/security/body";
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/db";
import { getActiveSession } from "@/lib/auth/session";
import { withActiveSession } from "@/lib/auth/session-access";
import { hasValidOrigin } from "@/lib/security/request";
import { getCatalog } from "@/lib/catalog/server";
import {
  deadlineWindowMs,
  materializeDeadlineNotifications,
} from "@/lib/notifications/deadline-reminders";

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
    deadlineAt: { lte: new Date(Date.now() + deadlineWindowMs) },
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
      // Tracker writes and both reminder paths share the owner lock.
      return (await materializeDeadlineNotifications(tx, user.id, programs))
        .enabled;
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
  const preference = await prisma.notificationPreference.findUnique({
    where: { userId: user.id },
    select: { deadlineEmailEnabled: true },
  });
  const emailEnabled = preference?.deadlineEmailEnabled ?? false;
  const emailAvailable =
    process.env.DEADLINE_EMAIL_ENABLED === "true" && !!user.emailVerified;
  return NextResponse.json({
    enabled,
    items,
    ...(emailAvailable || emailEnabled ? { emailEnabled, emailAvailable } : {}),
  });
}
const updateSchema = z.union([
  z.object({ enabled: z.boolean() }),
  z.object({ emailEnabled: z.boolean() }).strict(),
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
  if (
    "emailEnabled" in data &&
    data.emailEnabled &&
    (process.env.DEADLINE_EMAIL_ENABLED !== "true" || !user.emailVerified)
  )
    return NextResponse.json(
      { error: "Рассылка личных сроков сейчас недоступна" },
      { status: 409 },
    );
  const saved = await withActiveSession(access, async (tx) => {
    if ("emailEnabled" in data) {
      await tx.notificationPreference.upsert({
        where: { userId: user.id },
        create: { userId: user.id, deadlineEmailEnabled: data.emailEnabled },
        update: { deadlineEmailEnabled: data.emailEnabled },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "UPDATE_DEADLINE_EMAIL_PREFERENCE",
          entityType: "NOTIFICATION_PREFERENCE",
          entityId: user.id,
          after: { enabled: data.emailEnabled },
        },
      });
      return true;
    }
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
