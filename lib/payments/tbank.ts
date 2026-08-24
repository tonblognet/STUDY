import { createHash, timingSafeEqual } from "node:crypto";

type TbankScalar = string | number | boolean;
type TbankPayload = Record<string, unknown>;

export type TbankInitResponse = {
  Success: boolean;
  ErrorCode: string;
  Message?: string;
  Details?: string;
  PaymentId?: string;
  PaymentURL?: string;
  Status?: string;
  OrderId?: string;
};

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
  if (received.length !== expected.length) return false;
  return timingSafeEqual(
    Buffer.from(received, "utf8"),
    Buffer.from(expected, "utf8"),
  );
}

export async function initTbankPayment(
  payload: TbankPayload,
  config: { password: string; apiUrl?: string },
): Promise<TbankInitResponse> {
  const body = {
    ...payload,
    Token: createTbankToken(payload, config.password),
  };
  const response = await fetch(
    `${config.apiUrl ?? "https://securepay.tinkoff.ru/v2"}/Init`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok)
    throw new Error(`T-Bank Init returned HTTP ${response.status}`);
  const result = (await response.json()) as TbankInitResponse;
  if (!result.Success || !result.PaymentURL || !result.PaymentId) {
    throw new Error(
      result.Details ||
        result.Message ||
        `T-Bank Init failed with ${result.ErrorCode}`,
    );
  }
  return result;
}

export function customerKey(userId: string): string {
  return createHash("sha256").update(userId, "utf8").digest("hex").slice(0, 32);
}
