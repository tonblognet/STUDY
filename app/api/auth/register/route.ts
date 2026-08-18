import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "Парольная демо-регистрация отключена. Используйте защищённый вход на странице /register." }, { status: 410 });
}
