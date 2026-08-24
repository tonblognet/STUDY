import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/db";
import { requireRole } from "@/lib/auth/session";
import { hasValidOrigin } from "@/lib/security/request";

const patchSchema = z
  .object({
    name: z.string().trim().min(3).max(240).optional(),
    status: z.enum(["DRAFT", "REVIEW", "PUBLISHED", "REJECTED"]).optional(),
    durationMonths: z.number().int().min(6).max(120).optional(),
  })
  .strict();

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!hasValidOrigin(request))
    return NextResponse.json(
      { error: "Некорректный источник запроса" },
      { status: 403 },
    );
  const user = await requireRole(["CONTENT_MANAGER", "ADMIN", "SUPERADMIN"]);
  if (!user)
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Некорректные изменения" },
      { status: 400 },
    );
  const before = await prisma.educationProgram.findUnique({ where: { id } });
  if (!before)
    return NextResponse.json(
      { error: "Программа не найдена" },
      { status: 404 },
    );
  const after = await prisma.$transaction(async (tx) => {
    const updated = await tx.educationProgram.update({
      where: { id },
      data: {
        ...parsed.data,
        publishedAt:
          parsed.data.status === "PUBLISHED" ? new Date() : undefined,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "UPDATE_PROGRAM",
        entityType: "EducationProgram",
        entityId: id,
        before: {
          name: before.name,
          status: before.status,
          durationMonths: before.durationMonths,
        },
        after: parsed.data,
      },
    });
    return updated;
  });
  return NextResponse.json({ program: after });
}
