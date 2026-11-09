import { NextResponse } from "next/server";
import { z } from "zod";
import { readBoundedJson } from "@/lib/security/body";
import { checkRateLimit } from "@/lib/security/rate-limit";
import {
  attemptKeySchema,
  billingAccess,
  billingFailure,
} from "@/lib/payments/http";
import { BillingError } from "@/lib/payments/errors";
import { startCheckout } from "@/lib/payments/service";

const schema = z
  .object({ planCode: z.string().regex(/^[a-z0-9_]{1,48}$/) })
  .strict();
export async function POST(request: Request) {
  try {
    const access = await billingAccess(request, true);
    const key = attemptKeySchema.safeParse(
      request.headers.get("idempotency-key"),
    );
    const input = schema.safeParse(await readBoundedJson(request, 4096));
    if (!key.success || !input.success)
      throw new BillingError(
        400,
        "CHECKOUT_INPUT",
        "Обновите страницу и выберите тариф.",
      );
    if (
      !(await checkRateLimit(`checkout:${access.user.id}`, 60, 3600000)).allowed
    )
      throw new BillingError(
        429,
        "RATE_LIMIT",
        "Слишком много попыток. Повторите позже.",
      );
    const result = await startCheckout(access, input.data.planCode, key.data);
    return NextResponse.json(result, {
      status:
        result.paymentUrl ||
        result.payment.status !== "PENDING" ||
        result.payment.attemptState === "REJECTED"
          ? 200
          : 202,
    });
  } catch (error) {
    return billingFailure(error);
  }
}
