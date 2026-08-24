import { NextResponse } from "next/server";
import { tokenSchema } from "@/lib/auth/schemas";
import { verifyEmailToken } from "@/lib/auth/service";

export async function POST(request: Request) {
  const parsed = tokenSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !(await verifyEmailToken(parsed.data.token))) {
    return NextResponse.json(
      { error: "Ссылка недействительна или истекла" },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
