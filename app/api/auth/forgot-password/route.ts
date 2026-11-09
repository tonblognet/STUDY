import { readBoundedJson } from "@/lib/security/body";
import { NextResponse } from "next/server";
import { emailSchema } from "@/lib/auth/schemas";
import { requestPasswordReset } from "@/lib/auth/service";
import { acceptAuthMail } from "@/lib/auth/public-mail";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { hasValidOrigin, requestFingerprint } from "@/lib/security/request";

export async function POST(request: Request) {
  if (!hasValidOrigin(request))
    return NextResponse.json(
      { error: "Некорректный источник запроса" },
      { status: 403 },
    );
  const rate = await checkRateLimit(
    `forgot:${requestFingerprint(request)}`,
    5,
    30 * 60_000,
  );
  if (!rate.allowed)
    return NextResponse.json(
      { error: "Слишком много попыток" },
      { status: 429 },
    );
  const parsed = emailSchema.safeParse(
    await readBoundedJson(request).catch(() => null),
  );
  return acceptAuthMail("forgot-password", async () => {
    if (parsed.success) await requestPasswordReset(parsed.data.email);
  });
}
