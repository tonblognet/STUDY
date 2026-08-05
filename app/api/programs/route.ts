import { NextResponse } from "next/server";
import { programs } from "@/lib/data";

export async function GET() {
  return NextResponse.json({
    generatedAt: "2026-08-05T12:00:00.000Z",
    policy: "Все значения содержат собственный год, статус и источник; null не заменяется нулём.",
    programs,
  });
}
