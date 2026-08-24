import { NextResponse } from "next/server";
import { prisma } from "@/db";
import { verifyTbankToken } from "@/lib/payments/tbank";

export async function POST(request: Request) {
  const password = process.env.TBANK_PASSWORD;
  const terminalKey = process.env.TBANK_TERMINAL_KEY;
  if (!password || !terminalKey)
    return NextResponse.json(
      { error: "Webhook is not configured" },
      { status: 503 },
    );
  if (Number(request.headers.get("content-length") ?? 0) > 64_000)
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  const payload = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (
    !payload ||
    payload.TerminalKey !== terminalKey ||
    !verifyTbankToken(payload, password)
  ) {
    return NextResponse.json(
      { error: "Invalid payment notification" },
      { status: 401 },
    );
  }
  const orderId = typeof payload.OrderId === "string" ? payload.OrderId : "";
  const providerPaymentId = String(payload.PaymentId ?? "");
  const status = String(payload.Status ?? "");
  const amount = Number(payload.Amount);
  const payment = await prisma.payment.findUnique({
    where: { id: orderId },
    include: { product: true },
  });
  if (
    !payment ||
    payment.providerPaymentId !== providerPaymentId ||
    payment.amount !== amount
  ) {
    return NextResponse.json(
      { error: "Payment identity mismatch" },
      { status: 409 },
    );
  }
  if (payment.status === "SUCCEEDED" && status === "CONFIRMED")
    return new NextResponse("OK");

  await prisma.$transaction(async (tx) => {
    if (status === "CONFIRMED") {
      const now = new Date();
      const periodEnd = payment.product.durationDays
        ? new Date(now.getTime() + payment.product.durationDays * 86_400_000)
        : null;
      const subscription = periodEnd
        ? await tx.subscription.create({
            data: {
              userId: payment.userId,
              productId: payment.productId,
              provider: "tbank",
              planCode: payment.product.code,
              status: "ACTIVE",
              currentPeriodEnd: periodEnd,
              autoRenew: false,
            },
          })
        : null;
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "SUCCEEDED",
          providerStatus: status,
          paidAt: now,
          subscriptionId: subscription?.id,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: payment.userId,
          action: "PAYMENT_CONFIRMED",
          entityType: "Payment",
          entityId: payment.id,
          after: { productCode: payment.product.code, amount: payment.amount },
        },
      });
    } else if (
      ["REJECTED", "CANCELED", "DEADLINE_EXPIRED", "AUTH_FAIL"].includes(status)
    ) {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED", providerStatus: status },
      });
    } else {
      await tx.payment.update({
        where: { id: payment.id },
        data: { providerStatus: status },
      });
    }
  });
  return new NextResponse("OK");
}
