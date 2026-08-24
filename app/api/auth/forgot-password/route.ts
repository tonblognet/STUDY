import { NextResponse } from "next/server";
import { emailSchema } from "@/lib/auth/schemas";
import { requestPasswordReset } from "@/lib/auth/service";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { hasValidOrigin, requestFingerprint } from "@/lib/security/request";

export async function POST(request: Request) {
  if (!hasValidOrigin(request))
    return NextResponse.json(
      { error: "Некорректный источник запроса" },
      { status: 403 },
    );
  const rate = checkRateLimit(
    `forgot:${requestFingerprint(request)}`,
    5,
    30 * 60_000,
  );
  if (!rate.allowed)
    return NextResponse.json(
      { error: "Слишком много попыток" },
      { status: 429 },
    );
  const parsed = emailSchema.safeParse(await request.json().catch(() => null));
  if (parsed.success) await requestPasswordReset(parsed.data.email);
  return NextResponse.json(
    { message: "Если аккаунт существует, письмо уже отправлено." },
    { status: 202 },
  );
}
