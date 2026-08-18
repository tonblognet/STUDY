import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getPaymentPlan } from "@/lib/payments/plans";
import { customerKey, initTbankPayment } from "@/lib/payments/tbank";

const requestSchema = z.object({ planCode: z.string().min(1).max(32) });

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: "Сначала войдите в аккаунт." }, { status: 401 });

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Неизвестный тариф." }, { status: 400 });
  const plan = getPaymentPlan(parsed.data.planCode);
  if (!plan) return NextResponse.json({ error: "Неизвестный тариф." }, { status: 404 });

  if (process.env.PAYMENT_PROVIDER !== "tbank" || process.env.PAYMENTS_LIVE !== "true") {
    return NextResponse.json({ error: "Боевые платежи ещё не включены. Мы не активируем подписку без подтверждённой оплаты." }, { status: 503 });
  }

  const terminalKey = process.env.TBANK_TERMINAL_KEY;
  const password = process.env.TBANK_PASSWORD;
  const siteUrl = process.env.APP_URL;
  const notificationUrl = process.env.TBANK_NOTIFICATION_URL;
  if (!terminalKey || !password || !siteUrl || !notificationUrl || process.env.TBANK_FISCALIZATION_READY !== "true") {
    return NextResponse.json({ error: "Платёжный контур не прошёл обязательную настройку." }, { status: 503 });
  }

  try {
    const result = await initTbankPayment({
      TerminalKey: terminalKey,
      Amount: plan.amountKopecks,
      OrderId: randomUUID(),
      Description: `${plan.name}: ${plan.durationMonths} месяца`,
      CustomerKey: customerKey(user.userId),
      NotificationURL: notificationUrl,
      SuccessURL: `${siteUrl}/account?payment=success`,
      FailURL: `${siteUrl}/pricing?payment=failed`,
      DATA: { Email: user.email, planCode: plan.code },
    }, { password, apiUrl: process.env.TBANK_API_URL });
    return NextResponse.json({ paymentUrl: result.PaymentURL, paymentId: result.PaymentId });
  } catch (error) {
    console.error("Payment initialization failed", error);
    return NextResponse.json({ error: "Не удалось открыть защищённую форму оплаты. Попробуйте позже." }, { status: 502 });
  }
}
