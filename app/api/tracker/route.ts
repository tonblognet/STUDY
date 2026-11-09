import { readBoundedJson } from "@/lib/security/body";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/db";
import { getActiveSession, getSessionUser } from "@/lib/auth/session";
import { withActiveSession } from "@/lib/auth/session-access";
import { hasValidOrigin } from "@/lib/security/request";
import { getCatalog } from "@/lib/catalog/server";
import {
  trackerCreateSchema,
  trackerUpdateSchema,
} from "@/lib/account/tracker";
import {
  getTrackerProgramIdentity,
  preferredTrackerItem,
} from "@/lib/account/tracker-program";
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (user && request.headers.get("x-account-id") !== user.id)
    return NextResponse.json(
      { error: "Аккаунт в другой вкладке изменился. Перезагрузите страницу" },
      { status: 409 },
    );
  if (!user)
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  return NextResponse.json({
    items: await prisma.accountTrackerItem.findMany({
      where: { userId: user.id },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    }),
  });
}
export async function POST(request: Request) {
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
  const parsed = trackerCreateSchema.safeParse(
    await readBoundedJson(request).catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Проверьте программу и год" },
      { status: 400 },
    );
  const { programs } = await getCatalog();
  const program = programs.find((p) => p.id === parsed.data.programKey);
  if (!program)
    return NextResponse.json(
      { error: "Программа не найдена в каталоге" },
      { status: 400 },
    );
  const identity = getTrackerProgramIdentity(program, programs);
  if (!identity)
    return NextResponse.json(
      { error: "Связь программы с трекером требует уточнения" },
      { status: 409 },
    );
  const saved = await withActiveSession(access, async (tx) => {
    const existing = await tx.accountTrackerItem.findMany({
      where: {
        userId: user.id,
        programKey: { in: identity.aliases },
        admissionYear: parsed.data.admissionYear,
      },
    });
    const current = preferredTrackerItem(existing, identity);
    if (current) return current;
    if (
      (await tx.accountTrackerItem.count({ where: { userId: user.id } })) >= 200
    )
      return null;
    const item = await tx.accountTrackerItem.create({
      data: {
        userId: user.id,
        programKey: identity.canonicalKey,
        admissionYear: parsed.data.admissionYear,
        history: [
          { at: new Date().toISOString(), action: "Программа добавлена" },
        ],
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "CREATE_TRACKER",
        entityType: "TRACKER",
        entityId: item.id,
      },
    });
    return item;
  });
  if (!saved)
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  return saved.value
    ? NextResponse.json({ item: saved.value }, { status: 201 })
    : NextResponse.json(
        { error: "В трекере максимум 200 программ" },
        { status: 400 },
      );
}
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
  const parsed = trackerUpdateSchema.safeParse(
    await readBoundedJson(request).catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Проверьте этап, приоритет, срок и заметку" },
      { status: 400 },
    );
  const saved = await withActiveSession(access, async (tx) => {
    const current = await tx.accountTrackerItem.findFirst({
      where: { id: parsed.data.id, userId: user.id },
    });
    if (!current) return { status: 404, error: "Запись не найдена" };
    if (current.version !== parsed.data.version)
      return {
        status: 409,
        error: "Запись изменилась в другой вкладке. Обновите список",
      };
    const { id, version, ...data } = parsed.data;
    const history = Array.isArray(current.history) ? current.history : [];
    const item = await tx.accountTrackerItem.update({
      where: { id },
      data: {
        ...data,
        version: version + 1,
        history: [
          ...history.slice(-99),
          {
            at: new Date().toISOString(),
            action: `Сохранены этап «${data.stage}», приоритет и личные отметки`,
          },
        ],
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "UPDATE_TRACKER",
        entityType: "TRACKER",
        entityId: id,
      },
    });
    return { status: 200, item };
  });
  if (!saved)
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  return NextResponse.json(saved.value, { status: saved.value.status });
}
export async function DELETE(request: Request) {
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
  const parsed = z
    .object({ id: z.string().cuid(), version: z.number().int().positive() })
    .safeParse(await readBoundedJson(request).catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Проверьте запись" }, { status: 400 });
  const removed = await withActiveSession(access, async (tx) => {
    // The shared session guard locks User before the tracker row and audit FK.
    const result = await tx.accountTrackerItem.deleteMany({
      where: { ...parsed.data, userId: user.id },
    });
    if (result.count)
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "DELETE_TRACKER",
          entityType: "TRACKER",
          entityId: parsed.data.id,
        },
      });
    return result.count;
  });
  if (!removed)
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  return NextResponse.json(
    removed.value
      ? { ok: true }
      : { error: "Запись удалена или изменена. Обновите список" },
    { status: removed.value ? 200 : 409 },
  );
}
