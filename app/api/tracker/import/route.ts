import { readBoundedJson } from "@/lib/security/body";
import { NextResponse } from "next/server";
import { getActiveSession } from "@/lib/auth/session";
import { withActiveSession } from "@/lib/auth/session-access";
import { hasValidOrigin } from "@/lib/security/request";
import { getCatalog } from "@/lib/catalog/server";
import { legacyImportSchema } from "@/lib/account/legacy-tracker";
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
  const parsed = legacyImportSchema.safeParse(
    await readBoundedJson(request).catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Проверьте локальные записи и подтверждение владельца" },
      { status: 400 },
    );
  const { programs } = await getCatalog();
  const allowed = new Set(programs.map((p) => p.id));
  if (parsed.data.items.some((item) => !allowed.has(item.programId)))
    return NextResponse.json(
      {
        error:
          "Часть программ больше не опубликована. Локальная копия сохранена; перенесите нужные записи вручную",
      },
      { status: 400 },
    );
  const saved = await withActiveSession(access, async (tx) => {
    const existing = await tx.accountTrackerItem.findMany({
      where: { userId: user.id },
    });
    const items = [
      ...new Map(
        parsed.data.items.map((item) => [item.programId, item]),
      ).values(),
    ].filter(
      (item) =>
        !existing.some(
          (row) =>
            row.programKey === item.programId &&
            row.admissionYear === parsed.data.admissionYear,
        ),
    );
    if (existing.length + items.length > 200) return null;
    const result = await tx.accountTrackerItem.createMany({
      data: items.map(({ programId, ...item }) => ({
        ...item,
        userId: user.id,
        programKey: programId,
        admissionYear: parsed.data.admissionYear,
        history: [
          {
            at: new Date().toISOString(),
            action: "Перенесено из личной локальной копии",
          },
        ],
      })),
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "IMPORT_LOCAL_TRACKER",
        entityType: "TRACKER",
        entityId: user.id,
        after: { count: result.count },
      },
    });
    return result.count;
  });
  if (!saved)
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  return saved.value === null
    ? NextResponse.json(
        { error: "В трекере максимум 200 записей" },
        { status: 400 },
      )
    : NextResponse.json({ count: saved.value });
}
