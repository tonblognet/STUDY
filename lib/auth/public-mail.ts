import { after, NextResponse } from "next/server";

export function acceptAuthMail(
  action: "register" | "resend-verification" | "forgot-password",
  send: () => Promise<unknown>,
) {
  // Account lookup and SMTP outcomes must not affect the public response.
  after(async () => {
    try {
      await send();
    } catch {
      console.error(`Unable to process public auth request: ${action}`);
    }
  });
  return NextResponse.json(
    {
      message:
        "Запрос принят. Если для этого адреса доступно действие, проверьте почту, включая папку «Спам».",
    },
    { status: 202 },
  );
}
