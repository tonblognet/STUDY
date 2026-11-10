import { z } from "zod";
import { BillingError } from "./errors";

export type PaymentEnvironment = "live" | "sandbox";
export type BankConfiguration = {
  terminalKey: string;
  password: string;
  apiUrl: string;
  environment: PaymentEnvironment;
};
const taxes = [
  "none",
  "vat0",
  "vat5",
  "vat7",
  "vat10",
  "vat22",
  "vat105",
  "vat107",
  "vat110",
  "vat122",
] as const;
const receiptSchema = z
  .object({
    taxation: z.enum([
      "osn",
      "usn_income",
      "usn_income_outcome",
      "esn",
      "patent",
    ]),
    tax: z.enum(taxes),
    // Other methods require a separate service/closing-receipt workflow.
    method: z.literal("full_payment"),
    object: z.literal("service"),
    ffd: z.enum(["1.05", "1.2"]),
    measurementUnit: z.string().trim().min(1).max(16).optional(),
  })
  .refine((value) => value.ffd !== "1.2" || !!value.measurementUnit);
export type CheckoutSettings = BankConfiguration & {
  appUrl: string;
  notificationUrl: string;
  enabledProducts: ReadonlySet<string>;
  receipt: z.infer<typeof receiptSchema>;
};
const unavailable = () =>
  new BillingError(
    503,
    "PAYMENTS_UNAVAILABLE",
    "Оплата пока недоступна. Попробуйте позже или обратитесь в поддержку.",
  );

/** Checkout may be paused while existing bank events still settle. */
export function getBankConfiguration(
  env: Readonly<Record<string, string | undefined>> = process.env,
): BankConfiguration {
  const terminalKey = env.TBANK_TERMINAL_KEY?.trim();
  const password = env.TBANK_PASSWORD;
  if (!terminalKey || terminalKey.length > 64 || !password) throw unavailable();
  const environment = env.TBANK_ENVIRONMENT ?? "live";
  if (environment !== "live" && environment !== "sandbox") throw unavailable();
  const host =
    environment === "live"
      ? "securepay.tinkoff.ru"
      : "rest-api-test.tinkoff.ru";
  const apiUrl = env.TBANK_API_URL || `https://${host}/v2`;
  let url: URL;
  try {
    url = new URL(apiUrl);
  } catch {
    throw unavailable();
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== host ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname.replace(/\/$/, "") !== "/v2"
  )
    throw unavailable();
  return {
    terminalKey,
    password,
    apiUrl: url.href.replace(/\/$/, ""),
    environment,
  };
}

function applicationOrigin(value: string | undefined): string {
  let url: URL;
  try {
    url = new URL(value ?? "");
  } catch {
    throw unavailable();
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw unavailable();
  return url.origin;
}

export function getCheckoutSettings(
  env: Readonly<Record<string, string | undefined>> = process.env,
): CheckoutSettings {
  if (
    env.PAYMENT_PROVIDER !== "tbank" ||
    env.TBANK_FISCALIZATION_READY !== "true"
  )
    throw unavailable();
  const bank = getBankConfiguration(env);
  if (bank.environment === "live" && env.PAYMENTS_LIVE !== "true")
    throw unavailable();
  const enabledProducts = new Set(
    (env.PAYMENT_ENABLED_PRODUCTS ?? "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean),
  );
  if (
    !enabledProducts.size ||
    [...enabledProducts].some(
      (code) => !["default_1", "default_3", "default_12"].includes(code),
    )
  )
    throw unavailable();
  const receipt = receiptSchema.safeParse({
    taxation: env.TBANK_RECEIPT_TAXATION,
    tax: env.TBANK_RECEIPT_TAX,
    method: env.TBANK_RECEIPT_METHOD,
    object: env.TBANK_RECEIPT_OBJECT,
    ffd: env.TBANK_RECEIPT_FFD,
    measurementUnit: env.TBANK_RECEIPT_MEASUREMENT_UNIT || undefined,
  });
  if (!receipt.success) throw unavailable();
  const appUrl = applicationOrigin(env.APP_URL);
  if (env.TBANK_NOTIFICATION_URL !== `${appUrl}/api/webhooks/payments`)
    throw unavailable();
  return {
    ...bank,
    appUrl,
    notificationUrl: env.TBANK_NOTIFICATION_URL,
    enabledProducts,
    receipt: receipt.data,
  };
}

export function buildReceipt(
  settings: CheckoutSettings,
  product: { name: string; amount: number },
  email: string,
) {
  if (!z.string().email().max(64).safeParse(email).success)
    throw new BillingError(
      400,
      "RECEIPT_EMAIL",
      "Для чека нужен адрес почты длиной до 64 символов. Обратитесь в поддержку.",
    );
  if (!Number.isSafeInteger(product.amount) || product.amount <= 0)
    throw unavailable();
  return {
    Email: email,
    Taxation: settings.receipt.taxation,
    Items: [
      {
        Name: product.name.slice(0, 128),
        Price: product.amount,
        Quantity: 1,
        Amount: product.amount,
        Tax: settings.receipt.tax,
        PaymentMethod: settings.receipt.method,
        PaymentObject: settings.receipt.object,
        ...(settings.receipt.ffd === "1.2"
          ? { MeasurementUnit: settings.receipt.measurementUnit! }
          : {}),
      },
    ],
  };
}
