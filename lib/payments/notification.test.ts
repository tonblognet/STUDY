import { describe, expect, it } from "vitest";
import {
  paymentNotificationSchema,
  paymentAmountSchema,
  providerPaymentIdSchema,
} from "./notification";

const valid = {
  TerminalKey: "test-terminal",
  OrderId: "order-1",
  PaymentId: "12345678901234567890",
  Amount: 19900,
  Success: true,
  ErrorCode: "0",
  Status: "CONFIRMED",
  Token: "a".repeat(64),
};

describe("payment notification DTO", () => {
  it("keeps exact large decimal IDs without number coercion", () => {
    expect(paymentNotificationSchema.parse(valid).PaymentId).toBe(
      "12345678901234567890",
    );
    expect(providerPaymentIdSchema.parse("00000000000000000123")).toBe("123");
    expect(providerPaymentIdSchema.parse(123)).toBe("123");
    expect(providerPaymentIdSchema.parse(Number.MAX_SAFE_INTEGER)).toBe(
      String(Number.MAX_SAFE_INTEGER),
    );
  });

  it("preserves optional bank fields without interpreting them as commands", () => {
    const result = paymentNotificationSchema.parse({
      ...valid,
      CardId: 123,
      Pan: "430000******0000",
      Data: { injected: "untrusted" },
    });
    expect(result).toMatchObject({
      CardId: 123,
      Pan: "430000******0000",
      Data: { injected: "untrusted" },
    });
  });

  it("accepts the provider's PARTIAL_REFUNDED spelling and zero refund amount", () => {
    expect(
      paymentNotificationSchema.safeParse({
        ...valid,
        Status: "PARTIAL_REFUNDED",
        Amount: 0,
      }).success,
    ).toBe(true);
    expect(
      paymentNotificationSchema.safeParse({
        ...valid,
        Status: "PARTIALLY_REFUNDED",
      }).success,
    ).toBe(false);
  });

  it("accepts the exact identifier and digest bounds", () => {
    expect(
      paymentNotificationSchema.safeParse({
        ...valid,
        TerminalKey: "t".repeat(64),
        OrderId: "o".repeat(50),
        Token: "A".repeat(64),
      }).success,
    ).toBe(true);
  });

  it.each([0, 19900, "0", "1111", "00000111", "9007199254740991"])(
    "normalizes an exact scalar amount %# after signature verification",
    (Amount) => {
      expect(paymentAmountSchema.parse(Amount)).toBe(Number(Amount));
      expect(paymentNotificationSchema.parse({ ...valid, Amount }).Amount).toBe(
        Number(Amount),
      );
    },
  );

  it.each([
    "",
    " ",
    "1e3",
    "1.0",
    "+1",
    "-1",
    " 1",
    "１",
    "9007199254740992",
    "99999999999999999999",
    Number.MAX_SAFE_INTEGER + 1,
    -1,
    0.5,
    Infinity,
    NaN,
    {},
    [],
    true,
    null,
  ])("rejects malformed or inexact amounts %#", (Amount) => {
    expect(paymentAmountSchema.safeParse(Amount).success).toBe(false);
  });

  it.each([
    "",
    "0",
    "000",
    "1".repeat(21),
    "+123",
    "1e3",
    "12.3",
    " 123",
    "１２３",
    -1,
    0,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    Infinity,
    NaN,
    [],
    {},
    true,
    null,
  ])("rejects malformed or inexact PaymentId %#", (PaymentId) => {
    expect(providerPaymentIdSchema.safeParse(PaymentId).success).toBe(false);
  });

  it.each([
    { TerminalKey: "" },
    { TerminalKey: " " },
    { TerminalKey: "t".repeat(65) },
    { TerminalKey: [] },
    { OrderId: "" },
    { OrderId: "o".repeat(51) },
    { OrderId: 123 },
    { Amount: -1 },
    { Amount: 0.5 },
    { Amount: Number.MAX_SAFE_INTEGER + 1 },
    { Amount: [19900] },
    { Amount: null },
    { Success: false },
    { Success: "true" },
    { ErrorCode: 0 },
    { ErrorCode: "1" },
    { Status: "UNKNOWN" },
    { Status: "confirmed" },
    { Token: "é".repeat(64) },
    { Token: "g".repeat(64) },
    { Token: "a".repeat(63) },
    { Token: "a".repeat(65) },
    { Token: [] },
    { Token: {} },
  ])("rejects invalid notification fields %#", (invalid) => {
    expect(
      paymentNotificationSchema.safeParse({ ...valid, ...invalid }).success,
    ).toBe(false);
  });

  it("requires every authenticated business field", () => {
    for (const key of Object.keys(valid)) {
      const missing: Record<string, unknown> = { ...valid };
      delete missing[key];
      expect(paymentNotificationSchema.safeParse(missing).success, key).toBe(
        false,
      );
    }
  });
});
