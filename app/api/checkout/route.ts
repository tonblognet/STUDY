import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/db";
import { getSessionUser } from "@/lib/auth/session";
import { customerKey, initTbankPayment } from "@/lib/payments/tbank";
import { hasValidOrigin } from "@/lib/security/request";

const requestSchema = z.object({
  planCode: z.string().regex(/^[a-z0-9_]{1,48}$/),
});

export async function POST(request: Request) {
  if (!hasValidOrigin(request))
    return NextResponse.json(
      { error: "Некорректный источник запроса" },
      { status: 403 },
    );
  const user = await getSessionUser();
  if (!user)
    return NextResponse.json(
      { error: "Сначала войдите в аккаунт." },
      { status: 401 },
    );
  const parsed = requestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json({ error: "Неизвестный тариф." }, { status: 400 });
  const product = await prisma.product.findFirst({
    where: { code: parsed.data.planCode, active: true, purchasable: true },
  });
  if (!product)
    return NextResponse.json({ error: "Тариф недоступен." }, { status: 404 });

  if (
    process.env.PAYMENT_PROVIDER !== "tbank" ||
    process.env.PAYMENTS_LIVE !== "true"
  ) {
    return NextResponse.json(
      {
        error:
          "Боевые платежи ещё не включены. Доступ не активируется без подтверждённой оплаты.",
      },
      { status: 503 },
    );
  }
  const terminalKey = process.env.TBANK_TERMINAL_KEY;
  const password = process.env.TBANK_PASSWORD;
  const siteUrl = process.env.APP_URL;
  const notificationUrl = process.env.TBANK_NOTIFICATION_URL;
  if (
    !terminalKey ||
    !password ||
    !siteUrl ||
    !notificationUrl ||
    process.env.TBANK_FISCALIZATION_READY !== "true"
  ) {
    return NextResponse.json(
      { error: "Платёжный контур не прошёл обязательную настройку." },
      { status: 503 },
    );
  }

  const idempotencyKey = request.headers.get("idempotency-key") ?? randomUUID();
  const payment = await prisma.payment.upsert({
    where: { idempotencyKey },
    update: {},
    create: {
      userId: user.id,
      productId: product.id,
      idempotencyKey,
      amount: product.price,
      currency: product.currency,
      status: "PENDING",
      description: product.code,
    },
  });
  if (payment.providerPaymentId)
    return NextResponse.json(
      {
        error:
          "Этот checkout уже создан. Начните оплату повторно из списка платежей.",
      },
      { status: 409 },
    );

  try {
    const result = await initTbankPayment(
      {
        TerminalKey: terminalKey,
        Amount: product.price,
        OrderId: payment.id,
        Description: product.name,
        CustomerKey: customerKey(user.id),
        NotificationURL: notificationUrl,
        SuccessURL: `${siteUrl}/account?payment=success`,
        FailURL: `${siteUrl}/pricing?payment=failed`,
        DATA: { Email: user.email, planCode: product.code },
      },
      { password, apiUrl: process.env.TBANK_API_URL },
    );
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        providerPaymentId: result.PaymentId,
        providerStatus: result.Status,
      },
    });
    return NextResponse.json({
      paymentUrl: result.PaymentURL,
      paymentId: result.PaymentId,
    });
  } catch (error) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED", providerStatus: "INIT_ERROR" },
    });
    console.error("Payment initialization failed", {
      paymentId: payment.id,
      error: error instanceof Error ? error.name : "unknown",
    });
    return NextResponse.json(
      {
        error: "Не удалось открыть защищённую форму оплаты. Попробуйте позже.",
      },
      { status: 502 },
    );
  }
}
