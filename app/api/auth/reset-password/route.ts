import { NextResponse } from "next/server";
import { resetPasswordSchema } from "@/lib/auth/schemas";
import { resetPassword } from "@/lib/auth/service";
import { hasValidOrigin } from "@/lib/security/request";

export async function POST(request: Request) {
  if (!hasValidOrigin(request))
    return NextResponse.json(
      { error: "Некорректный источник запроса" },
      { status: 403 },
    );
  const parsed = resetPasswordSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Проверьте данные" },
      { status: 400 },
    );
  if (!(await resetPassword(parsed.data.token, parsed.data.password))) {
    return NextResponse.json(
      { error: "Ссылка недействительна или истекла" },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
