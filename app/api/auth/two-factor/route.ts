import { readBoundedJson } from "@/lib/security/body";
import { NextResponse } from "next/server";
import { twoFactorSchema } from "@/lib/auth/schemas";
import { consumeTwoFactorChallenge, createSession } from "@/lib/auth/service";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { hasValidOrigin, requestFingerprint } from "@/lib/security/request";
import { checkRateLimit } from "@/lib/security/rate-limit";

export async function POST(request: Request) {
  if (!hasValidOrigin(request))
    return NextResponse.json(
      { error: "Некорректный источник запроса" },
      { status: 403 },
    );
  const parsed = twoFactorSchema.safeParse(
    await readBoundedJson(request).catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json({ error: "Проверьте код" }, { status: 400 });
  if (
    !(
      await checkRateLimit(
        `two-factor:${requestFingerprint(request)}`,
        30,
        15 * 60_000,
      )
    ).allowed
  )
    return NextResponse.json(
      { error: "Слишком много попыток" },
      { status: 429 },
    );
  const user = await consumeTwoFactorChallenge(
    parsed.data.challengeId,
    parsed.data.code,
  );
  if (!user)
    return NextResponse.json(
      { error: "Код неверен или истёк" },
      { status: 401 },
    );
  const session = await createSession(
    user.id,
    {
      ipHash: requestFingerprint(request),
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
