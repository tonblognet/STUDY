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
import { reconcilePayment, requestFullRefund } from "@/lib/payments/service";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const access = await billingAccess(request, true, true);
    const { id } = await context.params;
    const input = z
      .object({
        action: z.enum(["reconcile", "refund"]),
        key: attemptKeySchema,
      })
      .strict()
      .safeParse(await readBoundedJson(request, 4096));
    if (!z.string().cuid().safeParse(id).success || !input.success)
      throw new BillingError(400, "PAYMENT_COMMAND", "Проверьте действие.");
    if (
      !(await checkRateLimit(`billing-staff:${access.user.id}`, 60, 60000))
        .allowed
    )
      throw new BillingError(429, "RATE_LIMIT", "Слишком много запросов.");
    const result =
      input.data.action === "refund"
        ? await requestFullRefund(access, id, input.data.key)
        : { payment: await reconcilePayment(access, id, input.data.key) };
    return NextResponse.json(result);
  } catch (error) {
    return billingFailure(error);
  }
}
