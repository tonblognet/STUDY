import { NextResponse } from "next/server";
import { getActiveSession } from "@/lib/auth/session";
import { PayloadTooLarge, readBoundedJson } from "@/lib/security/body";
import { hasValidOrigin } from "@/lib/security/request";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { SupportError } from "./service";
import { canManageSupport, isTicketId } from "./policy";
export async function supportAccess(
  request: Request,
  staff = false,
  mutation = false,
) {
  if (mutation && !hasValidOrigin(request))
    throw new SupportError("Некорректный источник запроса", 403);
  const access = await getActiveSession();
  if (!access) throw new SupportError("Требуется вход", 401);
  if (request.headers.get("x-account-id") !== access.user.id)
    throw new SupportError(
      "Аккаунт в другой вкладке изменился. Перезагрузите страницу",
      409,
    );
  if (staff && !canManageSupport(access.user.role))
    throw new SupportError("Доступ запрещён", 403);
  return access;
}
export async function supportBody(request: Request) {
  try {
    return await readBoundedJson(request, 32000);
  } catch (error) {
    if (error instanceof PayloadTooLarge)
      throw new SupportError("Сообщение слишком большое", 413);
    throw error;
  }
}
export async function supportRate(actorId: string, create = false) {
  const limited = await checkRateLimit(
    `support:${create ? "create" : "update"}:${actorId}`,
    create ? 5 : 40,
    create ? 3600000 : 60000,
  );
  if (!limited.allowed)
    throw new SupportError("Слишком много запросов. Попробуйте позже", 429);
}
export function supportId(id: string) {
  if (!isTicketId(id)) throw new SupportError("Обращение не найдено", 404);
  return id;
}
export function supportFailure(error: unknown) {
  return NextResponse.json(
    {
      error:
        error instanceof SupportError
          ? error.message
          : "Поддержка временно недоступна. Попробуйте позже",
    },
    { status: error instanceof SupportError ? error.status : 500 },
  );
}
