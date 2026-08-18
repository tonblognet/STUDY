import { NextResponse } from "next/server";
import { verifyTbankToken } from "@/lib/payments/tbank";

export async function POST(request: Request) {
  const password = process.env.TBANK_PASSWORD;
  const terminalKey = process.env.TBANK_TERMINAL_KEY;
  if (!password || !terminalKey) return NextResponse.json({ error: "Webhook is not configured" }, { status: 503 });

  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!payload || payload.TerminalKey !== terminalKey || !verifyTbankToken(payload, password)) {
    return NextResponse.json({ error: "Invalid payment notification" }, { status: 401 });
  }

  // Банк повторит уведомление, пока постоянное хранилище платежей не подключено.
  // Это безопаснее, чем отвечать OK и выдавать доступ, который нельзя восстановить.
  console.error("Verified payment notification requires persistent processing", {
    paymentId: payload.PaymentId,
    orderId: payload.OrderId,
    status: payload.Status,
  });
  return NextResponse.json({ error: "Payment persistence is not configured" }, { status: 503 });
}
