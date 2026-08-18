import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "Парольный демо-вход отключён. Используйте защищённый вход на странице /login." }, { status: 410 });
}
