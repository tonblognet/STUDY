import { describe, expect, it } from "vitest";
import { createTbankToken, customerKey, verifyTbankToken } from "./tbank";

describe("T-Bank token", () => {
  it("uses only sorted root scalar values and excludes Token", () => {
    const payload = { TerminalKey: "MerchantTerminalKey", Amount: 19200, OrderId: "00000", Description: "Подарочная карта на 1000 рублей", DATA: { Email: "a@test.com" } };
    expect(createTbankToken(payload, "11111111111111")).toBe("72dd466f8ace0a37a1f740ce5fb78101712bc0665d91a8108c7c8a0ccd426db2");
  });

  it("verifies notification tokens without trusting nested data", () => {
    const base = { TerminalKey: "demo", Amount: 59900, OrderId: "order-1", Success: true, Status: "CONFIRMED" };
    const Token = createTbankToken(base, "secret");
    expect(verifyTbankToken({ ...base, Token, Data: { injected: "ignored" } }, "secret")).toBe(true);
    expect(verifyTbankToken({ ...base, Amount: 1, Token }, "secret")).toBe(false);
  });

  it("produces a stable non-identifying customer key", () => {
    expect(customerKey("user-1")).toHaveLength(32);
    expect(customerKey("user-1")).toBe(customerKey("user-1"));
    expect(customerKey("user-1")).not.toBe(customerKey("user-2"));
  });
});
