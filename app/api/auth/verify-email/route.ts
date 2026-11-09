import { readBoundedJson } from "@/lib/security/body";
import { NextResponse } from "next/server";
import { verifyEmailSchema } from "@/lib/auth/schemas";
import { verifyEmailToken } from "@/lib/auth/service";
import { hasValidOrigin, requestFingerprint } from "@/lib/security/request";
import { checkRateLimit } from "@/lib/security/rate-limit";

export async function POST(request: Request) {
  if (!hasValidOrigin(request))
    return NextResponse.json(
      { error: "Некорректный источник запроса" },
      { status: 403 },
    );
  if (
    !(
      await checkRateLimit(
        `verify:${requestFingerprint(request)}`,
        30,
        15 * 60_000,
      )
    ).allowed
  )
    return NextResponse.json(
      { error: "Слишком много запросов" },
      { status: 429 },
    );
  const parsed = verifyEmailSchema.safeParse(
    await readBoundedJson(request).catch(() => null),
  );
  if (
    !parsed.success ||
    !(await verifyEmailToken(parsed.data.token, parsed.data.password))
  ) {
    return NextResponse.json(
      {
        error:
          "Проверьте пароль аккаунта. Возможно, ссылка недействительна или истекла.",
      },
      { status: 400 },
    );
  }
  return NextResponse.json({ ok: true });
}
