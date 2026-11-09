import { readBoundedJson } from "@/lib/security/body";
import { NextResponse } from "next/server";
import { registerSchema } from "@/lib/auth/schemas";
import { registerUser } from "@/lib/auth/service";
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
    `register:${requestFingerprint(request)}`,
    5,
    15 * 60_000,
  );
  if (!rate.allowed)
    return NextResponse.json(
      { error: "Слишком много попыток. Попробуйте позже." },
      { status: 429 },
    );
  const body = await readBoundedJson(request).catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Проверьте поля" },
      { status: 400 },
    );
  return acceptAuthMail("register", () => registerUser(parsed.data));
}
