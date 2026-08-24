import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/db";
import { getSessionUser } from "@/lib/auth/session";
import { hasValidOrigin } from "@/lib/security/request";

const createSchema = z.object({
  programId: z.string().cuid(),
  admissionYear: z.number().int().min(2026).max(2035),
});
const updateSchema = z.object({
  id: z.string().cuid(),
  priority: z.number().int().min(1).max(99).nullable().optional(),
  status: z
    .enum([
      "PLANNING",
      "DOCUMENTS_READY",
      "SUBMITTED",
      "IN_COMPETITION",
      "ENROLLED",
      "WITHDRAWN",
    ])
    .optional(),
  stage: z.string().trim().min(2).max(80).optional(),
  currentPosition: z.number().int().positive().nullable().optional(),
  deadlineAt: z.string().datetime().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function GET() {
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  return NextResponse.json({
    items: await prisma.admissionTrackerItem.findMany({
      where: { userId: user.id },
      orderBy: [{ priority: "asc" }, { updatedAt: "desc" }],
    }),
  });
}

export async function POST(request: Request) {
  if (!hasValidOrigin(request))
    return NextResponse.json(
      { error: "Некорректный источник запроса" },
      { status: 403 },
    );
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Некорректная программа" },
      { status: 400 },
    );
  const item = await prisma.admissionTrackerItem.upsert({
    where: {
      userId_programId_admissionYear: { userId: user.id, ...parsed.data },
    },
    update: {},
    create: {
      userId: user.id,
      ...parsed.data,
      status: "PLANNING",
      stage: "Выбор программы",
      history: [{ at: new Date().toISOString(), action: "CREATED" }],
    },
  });
  return NextResponse.json({ item }, { status: 201 });
}

export async function PATCH(request: Request) {
  if (!hasValidOrigin(request))
    return NextResponse.json(
      { error: "Некорректный источник запроса" },
      { status: 403 },
    );
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Некорректные изменения" },
      { status: 400 },
    );
  const current = await prisma.admissionTrackerItem.findFirst({
    where: { id: parsed.data.id, userId: user.id },
  });
  if (!current)
    return NextResponse.json({ error: "Запись не найдена" }, { status: 404 });
  const { id, deadlineAt, ...data } = parsed.data;
  const history = Array.isArray(current.history) ? current.history : [];
  const item = await prisma.admissionTrackerItem.update({
    where: { id },
    data: {
      ...data,
      deadlineAt:
        deadlineAt === undefined
          ? undefined
          : deadlineAt === null
            ? null
            : new Date(deadlineAt),
      history: [
        ...history,
        {
          at: new Date().toISOString(),
          action: "UPDATED",
          fields: Object.keys(data),
        },
      ],
    },
  });
  return NextResponse.json({ item });
}
