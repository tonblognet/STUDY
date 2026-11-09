import { readBoundedJson } from "@/lib/security/body";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/db";
import { getActiveSession, getSessionUser } from "@/lib/auth/session";
import {
  authenticate,
  changeTwoFactor,
  createTwoFactorChallenge,
} from "@/lib/auth/service";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { hasValidOrigin } from "@/lib/security/request";
const requestSchema = z.object({
  enabled: z.boolean(),
  password: z.string().min(1).max(128),
});
const confirmSchema = z.object({
  enabled: z.boolean(),
  challengeId: z.string().cuid(),
  code: z.string().regex(/^\d{6}$/),
});
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (user && request.headers.get("x-account-id") !== user.id)
    return NextResponse.json(
      { error: "Аккаунт в другой вкладке изменился. Перезагрузите страницу" },
      { status: 409 },
    );
  if (!user)
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  const sessions = await prisma.session.findMany({
    where: {
      userId: user.id,
      authVersion: user.authVersion,
      revokedAt: null,
      expires: { gt: new Date() },
    },
    select: { id: true, createdAt: true, expires: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ enabled: user.emailTwoFactorEnabled, sessions });
}
export async function POST(request: Request) {
  if (!hasValidOrigin(request))
    return NextResponse.json(
      { error: "Некорректный источник запроса" },
      { status: 403 },
    );
  const access = await getActiveSession();
  const user = access?.user;
  if (user && request.headers.get("x-account-id") !== user.id)
    return NextResponse.json(
      { error: "Аккаунт в другой вкладке изменился. Перезагрузите страницу" },
      { status: 409 },
    );
  if (!access || !user)
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  if (!(await checkRateLimit(`security:${user.id}`, 5, 15 * 60_000)).allowed)
    return NextResponse.json(
      { error: "Слишком много запросов" },
      { status: 429 },
    );
  const parsed = requestSchema.safeParse(
    await readBoundedJson(request).catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json({ error: "Проверьте данные" }, { status: 400 });
  const verified = await authenticate(user.email, parsed.data.password);
  if (!verified || !verified.emailVerified)
    return NextResponse.json({ error: "Неверный пароль" }, { status: 403 });
  const challengeId = await createTwoFactorChallenge(
    verified,
    parsed.data.enabled ? "ENABLE_2FA" : "DISABLE_2FA",
    access,
  );
  return challengeId
    ? NextResponse.json({ challengeId })
    : NextResponse.json({ error: "Повторите вход" }, { status: 401 });
}
export async function PATCH(request: Request) {
  if (!hasValidOrigin(request))
    return NextResponse.json(
      { error: "Некорректный источник запроса" },
      { status: 403 },
    );
  const access = await getActiveSession();
  const user = access?.user;
  if (user && request.headers.get("x-account-id") !== user.id)
    return NextResponse.json(
      { error: "Аккаунт в другой вкладке изменился. Перезагрузите страницу" },
      { status: 409 },
    );
  if (!access || !user)
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  const parsed = confirmSchema.safeParse(
    await readBoundedJson(request).catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json({ error: "Проверьте код" }, { status: 400 });
  const { challengeId, code, enabled } = parsed.data;
  const result = await changeTwoFactor(access, challengeId, code, enabled);
  if (result === "inactive")
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  if (result === "invalid")
    return NextResponse.json(
      { error: "Код неверен или истёк" },
      { status: 400 },
    );
  return NextResponse.json({ ok: true });
}
