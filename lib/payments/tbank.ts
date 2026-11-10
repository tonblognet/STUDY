import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { paymentAmountSchema, providerPaymentIdSchema } from "./notification";

type TbankScalar = string | number | boolean;
type TbankPayload = Record<string, unknown>;

export type TbankConfig = {
  password: string;
  terminalKey?: string;
  apiUrl?: string;
};
const statusSchema = z.string().min(1).max(40);
const identitySchema = z.object({
  TerminalKey: z.string().min(1).max(64),
  PaymentId: providerPaymentIdSchema,
  OrderId: z.string().min(1).max(50),
  Amount: paymentAmountSchema,
  Status: statusSchema,
});
export type TbankPaymentStateResponse = z.infer<typeof identitySchema>;
export type TbankInitResponse = TbankPaymentStateResponse & {
  PaymentURL: string;
};
export type TbankOrderResponse = {
  TerminalKey: string;
  OrderId: string;
  Payments: Array<{ PaymentId: string; Amount: number; Status: string }>;
};
export type TbankCancelResponse = {
  TerminalKey: string;
  PaymentId: string;
  Status: string;
};

export class TbankProtocolError extends Error {
  constructor(public readonly rejected = false) {
    super("The bank response could not be safely applied");
    this.name = "TbankProtocolError";
  }
}

export function isTrustedPaymentUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      ["securepay.tinkoff.ru", "securepayments.tinkoff.ru"].includes(
        url.hostname,
      ) &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.hash
    );
  } catch {
    return false;
  }
}

function isScalar(value: unknown): value is TbankScalar {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

export function createTbankToken(
  payload: TbankPayload,
  password: string,
): string {
  const pairs = Object.entries({ ...payload, Password: password })
    .filter(([key, value]) => key !== "Token" && isScalar(value))
    .sort(([left], [right]) => left.localeCompare(right));
  const source = pairs.map(([, value]) => String(value)).join("");
  return createHash("sha256").update(source, "utf8").digest("hex");
}

export function verifyTbankToken(
  payload: TbankPayload,
  password: string,
): boolean {
  const received =
    typeof payload.Token === "string" ? payload.Token.toLowerCase() : "";
  const expected = createTbankToken(payload, password);
  if (!/^[a-f0-9]{64}$/.test(received)) return false;
  return timingSafeEqual(
    Buffer.from(received, "utf8"),
    Buffer.from(expected, "utf8"),
  );
}

async function bankRequest(
  method: string,
  payload: TbankPayload,
  config: TbankConfig,
): Promise<Record<string, unknown>> {
  let base: URL;
  try {
    base = new URL(config.apiUrl ?? "https://securepay.tinkoff.ru/v2");
  } catch {
    throw new TbankProtocolError();
  }
  if (
    base.protocol !== "https:" ||
    !["securepay.tinkoff.ru", "rest-api-test.tinkoff.ru"].includes(
      base.hostname,
    ) ||
    base.port ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.pathname.replace(/\/$/, "") !== "/v2"
  )
    throw new TbankProtocolError();
  const body = {
    ...payload,
    Token: createTbankToken(payload, config.password),
  };
  const response = await fetch(`${base.href.replace(/\/$/, "")}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
  });
  if (!response.ok) throw new TbankProtocolError();
  const reader = response.body?.getReader();
  if (!reader) throw new TbankProtocolError();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 64000) {
        await reader.cancel();
        throw new TbankProtocolError();
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  let result: unknown;
  try {
    result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new TbankProtocolError();
  }
  if (!result || typeof result !== "object" || Array.isArray(result))
    throw new TbankProtocolError();
  const record = result as Record<string, unknown>;
  if (record.Success !== true || record.ErrorCode !== "0") {
    // Only an explicit negative bank response is a definitive rejection.
    throw new TbankProtocolError(
      record.Success === false &&
        typeof record.ErrorCode === "string" &&
        record.ErrorCode !== "0",
    );
  }
  if (record.TerminalKey !== payload.TerminalKey)
    throw new TbankProtocolError();
  return record;
}

export async function initTbankPayment(
  payload: TbankPayload,
  config: TbankConfig,
): Promise<TbankInitResponse> {
  const result = await bankRequest("Init", payload, config);
  const parsed = identitySchema
    .extend({ PaymentURL: z.string().max(2048).refine(isTrustedPaymentUrl) })
    .safeParse(result);
  if (
    !parsed.success ||
    parsed.data.OrderId !== payload.OrderId ||
    parsed.data.Amount !== payload.Amount ||
    parsed.data.Amount <= 0
  )
    throw new TbankProtocolError();
  return parsed.data;
}

type TerminalConfig = TbankConfig & { terminalKey: string };
export async function getTbankPaymentState(
  paymentId: string,
  config: TerminalConfig,
): Promise<TbankPaymentStateResponse> {
  const result = await bankRequest(
    "GetState",
    { TerminalKey: config.terminalKey, PaymentId: paymentId },
    config,
  );
  const parsed = identitySchema.safeParse(result);
  if (!parsed.success || parsed.data.PaymentId !== paymentId)
    throw new TbankProtocolError();
  return parsed.data;
}

export async function checkTbankOrder(
  orderId: string,
  config: TerminalConfig,
): Promise<TbankOrderResponse> {
  const result = await bankRequest(
    "CheckOrder",
    { TerminalKey: config.terminalKey, OrderId: orderId },
    config,
  );
  const parsed = z
    .object({
      TerminalKey: z.string(),
      OrderId: z.string(),
      Payments: z
        .array(
          z.object({
            PaymentId: providerPaymentIdSchema,
            Amount: paymentAmountSchema,
            Status: statusSchema,
          }),
        )
        .max(100),
    })
    .safeParse(result);
  if (
    !parsed.success ||
    parsed.data.OrderId !== orderId ||
    new Set(parsed.data.Payments.map((p) => p.PaymentId)).size !==
      parsed.data.Payments.length
  )
    throw new TbankProtocolError();
  return parsed.data;
}

export async function cancelTbankPayment(
  input: { paymentId: string; externalRequestId: string },
  config: TerminalConfig,
): Promise<TbankCancelResponse> {
  if (!/^[a-zA-Z0-9_-]{1,30}$/.test(input.externalRequestId))
    throw new TbankProtocolError();
  const result = await bankRequest(
    "Cancel",
    {
      TerminalKey: config.terminalKey,
      PaymentId: input.paymentId,
      ExternalRequestId: input.externalRequestId,
    },
    config,
  );
  const parsed = z
    .object({
      TerminalKey: z.string(),
      PaymentId: providerPaymentIdSchema,
      Status: statusSchema,
    })
    .safeParse(result);
  if (!parsed.success || parsed.data.PaymentId !== input.paymentId)
    throw new TbankProtocolError();
  return parsed.data;
}

export function customerKey(userId: string): string {
  return createHash("sha256").update(userId, "utf8").digest("hex").slice(0, 32);
}
