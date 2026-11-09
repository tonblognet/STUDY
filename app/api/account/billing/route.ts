import { NextResponse } from "next/server";
import { z } from "zod";
import { billingAccess, billingFailure } from "@/lib/payments/http";
import { BillingError } from "@/lib/payments/errors";
import { getAccountBilling } from "@/lib/payments/service";

export async function GET(request: Request) {
  try {
    const access = await billingAccess(request);
    const query = z
      .object({ cursor: z.string().cuid().optional() })
      .strict()
      .safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!query.success)
      throw new BillingError(400, "PAGINATION", "Обновите список платежей.");
    return NextResponse.json(
      await getAccountBilling(access.user.id, query.data.cursor),
    );
  } catch (error) {
    return billingFailure(error);
  }
}
