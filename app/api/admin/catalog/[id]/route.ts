import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/db";
import { requireRole } from "@/lib/auth/session";
import { hasValidOrigin } from "@/lib/security/request";
import { reviewCatalog } from "@/lib/catalog/service";
import { catalogRequestBody, catalogFailure } from "@/lib/catalog/http";
import { catalogStorage } from "@/lib/catalog/server";
import { CatalogError } from "@/lib/catalog/types";

const reviewSchema = z
  .object({
    decision: z.enum(["publish", "reject"]),
    reason: z.string().trim().min(10).max(2000),
  })
  .strict();

export async function POST(
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
        "Публикация доступна только в режиме PostgreSQL",
        409,
      );
    const parsed = reviewSchema.safeParse(await catalogRequestBody(request));
    if (!parsed.success)
      throw new CatalogError(
        "Укажите решение и обоснование от 10 до 2000 символов",
      );
    const result = await reviewCatalog(
      prisma,
      (await params).id,
      parsed.data.decision,
      { actor, reason: parsed.data.reason },
    );
    return NextResponse.json(result);
  } catch (error) {
    return catalogFailure(error);
  }
}
