import { NextResponse } from "next/server";
import { getCatalogPublication } from "@/lib/catalog/server";

export async function GET() {
  const { snapshot, revisionId, publishedAt } = await getCatalogPublication();
  return NextResponse.json({
    revisionId,
    publishedAt,
    policy:
      "Все значения содержат собственный год, статус и источник; null не заменяется нулём.",
    programs: snapshot.programs,
  });
}
