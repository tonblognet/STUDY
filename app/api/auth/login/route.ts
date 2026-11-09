import { readBoundedJson } from "@/lib/security/body";
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
  const rate = await checkRateLimit(`login:${fingerprint}`, 8, 15 * 60_000);
  if (!rate.allowed)
    return NextResponse.json(
      { error: "Слишком много попыток. Попробуйте позже." },
      { status: 429 },
    );
  const parsed = credentialsSchema.safeParse(
    await readBoundedJson(request).catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Неверный email или пароль" },
      { status: 401 },
    );
  const accountRate = await checkRateLimit(
    `login-email:${parsed.data.email}`,
    12,
    15 * 60_000,
  );
  if (!accountRate.allowed)
    return NextResponse.json(
      { error: "Слишком много попыток. Попробуйте позже." },
      { status: 429 },
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
    return challengeId
      ? NextResponse.json({ requiresTwoFactor: true, challengeId })
      : NextResponse.json({ error: "Войдите ещё раз" }, { status: 401 });
  }
  const session = await createSession(
    user.id,
    {
      ipHash: fingerprint,
      userAgent: request.headers.get("user-agent") ?? undefined,
    },
    user.authVersion,
  );
  if (!session)
    return NextResponse.json({ error: "Войдите ещё раз" }, { status: 401 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    SESSION_COOKIE,
    session.token,
    sessionCookieOptions(session.expires),
  );
  return response;
}
