import { NextResponse } from "next/server";
import { prisma } from "@/db";
import { requireRole } from "@/lib/auth/session";
import { hasValidOrigin } from "@/lib/security/request";
import { readPublishedCatalog, stageCatalog } from "@/lib/catalog/service";
import {
  programEditSchema,
  applyProgramEdit,
} from "@/lib/catalog/program-edit";
import { CatalogError } from "@/lib/catalog/types";
import { catalogRequestBody, catalogFailure } from "@/lib/catalog/http";
import { catalogStorage } from "@/lib/catalog/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!hasValidOrigin(request))
    return NextResponse.json(
      { error: "Некорректный источник запроса" },
      { status: 403 },
    );
  const actor = await requireRole(["CONTENT_MANAGER", "ADMIN", "SUPERADMIN"]);
  if (!actor)
    return NextResponse.json({ error: "Доступ запрещён" }, { status: 403 });
  try {
    if (catalogStorage() !== "database")
      throw new CatalogError(
        "Редактирование доступно только в режиме PostgreSQL",
        409,
      );
    const parsed = programEditSchema.safeParse(
      await catalogRequestBody(request),
    );
    if (!parsed.success)
      throw new CatalogError(
        "Укажите поле, значение с источником, годом и датой, основу публикации и причину",
      );
    parsed.data.fact.checkedBy = actor.email;
    const current = await readPublishedCatalog(prisma);
    const next = applyProgramEdit(
      current.snapshot,
      (await params).id,
      parsed.data,
    );
    const revision = await stageCatalog(prisma, next, {
      actor,
      reason: parsed.data.reason,
      expectedRevisionId: parsed.data.baseRevisionId,
    });
    return NextResponse.json(
      { revision },
      { status: revision.unchanged ? 200 : 202 },
    );
  } catch (error) {
    return catalogFailure(error);
  }
}
