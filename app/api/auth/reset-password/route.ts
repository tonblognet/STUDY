import { readBoundedJson } from "@/lib/security/body";
import { NextResponse } from "next/server";
import { resetPasswordSchema } from "@/lib/auth/schemas";
import { resetPassword } from "@/lib/auth/service";
import { hasValidOrigin, requestFingerprint } from "@/lib/security/request";
import { checkRateLimit } from "@/lib/security/rate-limit";

export async function POST(request: Request) {
  if (!hasValidOrigin(request))
    return NextResponse.json(
      { error: "Некорректный источник запроса" },
      { status: 403 },
    );
  const parsed = resetPasswordSchema.safeParse(
    await readBoundedJson(request).catch(() => null),
  );
  if (
    !(
      await checkRateLimit(
        `reset:${requestFingerprint(request)}`,
        10,
        15 * 60_000,
      )
    ).allowed
  )
    return NextResponse.json(
      { error: "Слишком много попыток" },
      { status: 429 },
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
