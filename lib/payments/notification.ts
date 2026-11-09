import { z } from "zod";
import { supportedProviderStatuses } from "./state";

const boundedIdentifier = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((value) => value.trim().length > 0, "Identifier is required");

export const providerPaymentIdSchema = z
  .union([
    z.string().regex(/^[0-9]{1,20}$/),
    z.number().int().safe().positive(),
  ])
  .refine(
    (value) =>
      typeof value === "number"
        ? Number.isSafeInteger(value) && value > 0
        : /^[0-9]{1,20}$/.test(value) && /[1-9]/.test(value),
    "PaymentId must be positive",
  )
  .transform((value) => BigInt(value).toString());

export const paymentAmountSchema = z
  .union([z.string().regex(/^[0-9]+$/), z.number().int().safe().nonnegative()])
  .refine(
    (value) =>
      (typeof value === "number" || /^[0-9]+$/.test(value)) &&
      Number.isSafeInteger(Number(value)) &&
      Number(value) >= 0,
    "Amount must be a nonnegative safe integer",
  )
  .transform(Number);

/** Verify the signature on the original bounded JSON before parsing this DTO.
 * PaymentId normalization changes its spelling; signatures also include optional
 * root scalar bank fields. Extra fields remain untrusted and are never commands.
 */
export const paymentNotificationSchema = z
  .object({
    TerminalKey: boundedIdentifier(64),
    OrderId: boundedIdentifier(50),
    PaymentId: providerPaymentIdSchema,
    Amount: paymentAmountSchema,
    Success: z.literal(true),
    ErrorCode: z.literal("0"),
    Status: z.enum(supportedProviderStatuses),
    Token: z.string().regex(/^[a-f0-9]{64}$/i),
  })
  .passthrough();

export type PaymentNotification = z.infer<typeof paymentNotificationSchema>;
