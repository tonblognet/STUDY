import { describe, expect, it } from "vitest";
import { createTbankToken, verifyTbankToken } from "./tbank";

const notification = {
  TerminalKey: "fixture-terminal",
  OrderId: "order-1",
  PaymentId: "123",
  Amount: 19900,
  Success: true,
  ErrorCode: "0",
  Status: "CONFIRMED",
};

describe("malformed bank signatures", () => {
  it.each([
    "é".repeat(64),
    "😀".repeat(32),
    "g".repeat(64),
    "a".repeat(63),
    "a".repeat(65),
    [],
    {},
    null,
    undefined,
    123,
  ])("rejects token %# without throwing", (Token) => {
    const payload = { ...notification, Token };
    expect(() => verifyTbankToken(payload, "fixture-secret")).not.toThrow();
    expect(verifyTbankToken(payload, "fixture-secret")).toBe(false);
  });

  it("still authenticates all original scalar fields and detects tampering", () => {
    const original = { ...notification, CardId: 123, Pan: "430000******0000" };
    const Token = createTbankToken(original, "fixture-secret");
    expect(verifyTbankToken({ ...original, Token }, "fixture-secret")).toBe(
      true,
    );
    expect(
      verifyTbankToken({ ...original, Amount: 1, Token }, "fixture-secret"),
    ).toBe(false);
  });
});
