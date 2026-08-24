import { NextResponse } from "next/server";
import { credentialsSchema } from "@/lib/auth/schemas";
import {
  authenticate,
  createSession,
  createTwoFactorChallenge,
} from "@/lib/auth/service";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { hasValidOrigin, requestFingerprint } from "@/lib/security/request";

export async function POST(request: Request) {
  if (!hasValidOrigin(request))
    return NextResponse.json(
      { error: "Некорректный источник запроса" },
      { status: 403 },
    );
  const fingerprint = requestFingerprint(request);
  const rate = checkRateLimit(`login:${fingerprint}`, 8, 15 * 60_000);
  if (!rate.allowed)
    return NextResponse.json(
      { error: "Слишком много попыток. Попробуйте позже." },
      { status: 429 },
    );
  const parsed = credentialsSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Неверный email или пароль" },
      { status: 401 },
    );
  const user = await authenticate(parsed.data.email, parsed.data.password);
  if (!user)
    return NextResponse.json(
      { error: "Неверный email или пароль" },
      { status: 401 },
    );
  if (!user.emailVerified)
    return NextResponse.json(
      { error: "Подтвердите email перед входом" },
      { status: 403 },
    );
  if (user.emailTwoFactorEnabled) {
    const challengeId = await createTwoFactorChallenge(user);
    return NextResponse.json({ requiresTwoFactor: true, challengeId });
  }
  const session = await createSession(user.id, {
    ipHash: fingerprint,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    SESSION_COOKIE,
    session.token,
    sessionCookieOptions(session.expires),
  );
  return response;
}
