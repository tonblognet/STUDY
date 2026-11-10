import { NextResponse } from "next/server";
import { getActiveSession } from "@/lib/auth/session";
import { hasValidOrigin } from "@/lib/security/request";
import { PayloadTooLarge } from "@/lib/security/body";
import { BillingError } from "./errors";
import { z } from "zod";

export const attemptKeySchema = z.string().regex(/^[a-zA-Z0-9_-]{8,128}$/);
export async function billingAccess(
  request: Request,
  mutation = false,
  staff = false,
) {
  if (mutation && !hasValidOrigin(request))
    throw new BillingError(403, "ORIGIN", "Некорректный источник запроса.");
  const access = await getActiveSession();
  if (!access) throw new BillingError(401, "AUTH", "Требуется вход.");
  if (request.headers.get("x-account-id") !== access.user.id)
    throw new BillingError(
      409,
      "ACCOUNT_CHANGED",
      "Аккаунт в другой вкладке изменился. Перезагрузите страницу.",
    );
  if (staff && !["ADMIN", "SUPERADMIN"].includes(access.user.role))
    throw new BillingError(403, "ROLE", "Доступ запрещён.");
  return access;
}
export function billingFailure(error: unknown) {
  if (error instanceof PayloadTooLarge)
    return NextResponse.json(
      { error: "Слишком большой запрос." },
      { status: 413 },
    );
  if (error instanceof BillingError)
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  console.error("Billing request failed", {
    error: error instanceof Error ? error.name : "unknown",
  });
  return NextResponse.json(
    { error: "Сервис временно недоступен. Повторите позже." },
    { status: 503 },
  );
}
