import { readBoundedJson } from "@/lib/security/body";
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/db";
import { getActiveSession } from "@/lib/auth/session";
import { withActiveSession } from "@/lib/auth/session-access";
import { hasValidOrigin } from "@/lib/security/request";
import { hashToken } from "@/lib/auth/crypto";
import { getCatalog } from "@/lib/catalog/server";

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
    const names = new Map(
      programs.map((program) => [
        program.id,
        `${program.universityShort} · ${program.title}`,
      ]),
    );
    const refreshed = await withActiveSession(access, async (tx) => {
      // Tracker and preference writes share the owner lock with reminder creation.
      if (!(await remindersEnabled(tx, user.id))) return false;
      const due = await tx.accountTrackerItem.findMany({
        where: dueFilter,
        take: 200,
      });
      if (due.length)
        await tx.notification.createMany({
          skipDuplicates: true,
          data: due.map((item) => ({
            id: hashToken(
              `${user.id}:${item.id}:${item.deadlineAt!.toISOString()}`,
            ),
            userId: user.id,
            type: "PERSONAL_DEADLINE",
            title: "Личный срок в трекере",
            body: `${names.get(item.programKey) ?? "Программа из вашего трекера"} · ${item.admissionYear}: ${item.deadlineAt!.toLocaleDateString("ru-RU", { timeZone: "UTC" })}. Срок задан вами; проверьте условия на сайте вуза.`,
          })),
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
