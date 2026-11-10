import { NextResponse } from "next/server";
import { readBoundedJson } from "@/lib/security/body";
import { getBankConfiguration } from "@/lib/payments/config";
import { BillingError } from "@/lib/payments/errors";
import { billingFailure } from "@/lib/payments/http";
import { paymentNotificationSchema } from "@/lib/payments/notification";
import { receiveBankNotification } from "@/lib/payments/service";
import { verifyTbankToken } from "@/lib/payments/tbank";

export async function POST(request: Request) {
  try {
    const bank = getBankConfiguration();
    const raw = await readBoundedJson(request, 32000);
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new BillingError(401, "SIGNATURE", "Invalid payment notification");
    const record = raw as Record<string, unknown>;
    if (
      record.TerminalKey !== bank.terminalKey ||
      !verifyTbankToken(record, bank.password)
    )
      throw new BillingError(401, "SIGNATURE", "Invalid payment notification");
    const parsed = paymentNotificationSchema.safeParse(raw);
    if (!parsed.success)
      throw new BillingError(400, "PAYMENT_EVENT", "Invalid payment event");
    const result = await receiveBankNotification(parsed.data, bank);
    if (!result.accepted)
      throw new BillingError(
        409,
        "PAYMENT_IDENTITY",
        "Payment identity requires review",
      );
    return new NextResponse("OK", { status: 200 });
  } catch (error) {
    return billingFailure(error);
  }
}
