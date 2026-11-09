import { readBoundedJson } from "@/lib/security/body";
import { NextResponse } from "next/server";
import { emailSchema } from "@/lib/auth/schemas";
import { resendVerification } from "@/lib/auth/service";
import { acceptAuthMail } from "@/lib/auth/public-mail";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { hasValidOrigin, requestFingerprint } from "@/lib/security/request";
export async function POST(request: Request) {
  if (!hasValidOrigin(request))
    return NextResponse.json(
      { error: "Некорректный источник запроса" },
      { status: 403 },
    );
  const parsed = emailSchema.safeParse(
    await readBoundedJson(request).catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json({ error: "Проверьте email" }, { status: 400 });
  const ip = await checkRateLimit(
    `resend:${requestFingerprint(request)}`,
    5,
    30 * 60_000,
  );
  const email = await checkRateLimit(
    `resend-email:${parsed.data.email}`,
    3,
    30 * 60_000,
  );
  if (!ip.allowed || !email.allowed)
    return NextResponse.json(
      { error: "Слишком много запросов" },
      { status: 429 },
    );
  return acceptAuthMail("resend-verification", () =>
    resendVerification(parsed.data.email),
  );
}
