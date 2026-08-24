import { NextResponse } from "next/server";
import { revokeAllSessions } from "@/lib/auth/service";
import { getSessionUser, SESSION_COOKIE } from "@/lib/auth/session";
import { hasValidOrigin } from "@/lib/security/request";

export async function POST(request: Request) {
  if (!hasValidOrigin(request))
    return NextResponse.json(
      { error: "Некорректный источник запроса" },
      { status: 403 },
    );
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  await revokeAllSessions(user.id);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, "", {
    path: "/",
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax",
  });
  return response;
}
