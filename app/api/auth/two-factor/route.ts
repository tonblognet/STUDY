import { NextResponse } from "next/server";
import { twoFactorSchema } from "@/lib/auth/schemas";
import { consumeTwoFactorChallenge, createSession } from "@/lib/auth/service";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { hasValidOrigin, requestFingerprint } from "@/lib/security/request";

export async function POST(request: Request) {
  if (!hasValidOrigin(request))
    return NextResponse.json(
      { error: "Некорректный источник запроса" },
      { status: 403 },
    );
  const parsed = twoFactorSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json({ error: "Проверьте код" }, { status: 400 });
  const user = await consumeTwoFactorChallenge(
    parsed.data.challengeId,
    parsed.data.code,
  );
  if (!user)
    return NextResponse.json(
      { error: "Код неверен или истёк" },
      { status: 401 },
    );
  const session = await createSession(user.id, {
    ipHash: requestFingerprint(request),
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
