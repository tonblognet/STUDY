import { NextResponse } from "next/server";
import { z } from "zod";
import { billingAccess, billingFailure } from "@/lib/payments/http";
import { BillingError } from "@/lib/payments/errors";
import { getAdminBilling } from "@/lib/payments/service";

export async function GET(request: Request) {
  try {
    const access = await billingAccess(request, false, true);
    const query = z
      .object({ page: z.coerce.number().int().min(1).max(5000).default(1) })
      .strict()
      .safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!query.success)
      throw new BillingError(400, "PAGINATION", "Проверьте номер страницы.");
    return NextResponse.json(await getAdminBilling(access, query.data.page));
  } catch (error) {
    return billingFailure(error);
  }
}
