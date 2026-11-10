import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cancelTbankPayment,
  checkTbankOrder,
  getTbankPaymentState,
  initTbankPayment,
  isTrustedPaymentUrl,
} from "./tbank";

const config = { terminalKey: "fixture-terminal", password: "fixture-secret" };
const identity = {
  Success: true,
  ErrorCode: "0",
  TerminalKey: config.terminalKey,
  OrderId: "fixture-order",
  PaymentId: "12345",
  Amount: 19900,
  Status: "NEW",
};
const init = {
  TerminalKey: config.terminalKey,
  OrderId: identity.OrderId,
  Amount: identity.Amount,
};
function response(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
}
afterEach(() => vi.restoreAllMocks());
describe("bank protocol boundary", () => {
  it("signs the original request and retains a verified payment URL", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response({
        ...identity,
        PaymentURL: "https://securepayments.tinkoff.ru/fixture",
      }),
    );
    const result = await initTbankPayment(init, config);
    expect(result.PaymentId).toBe("12345");
    const [, options] = fetch.mock.calls[0];
    const body = JSON.parse(options!.body as string);
    expect(body.Token).toMatch(/^[a-f0-9]{64}$/);
    expect(body.Password).toBeUndefined();
    expect(options!.redirect).toBe("error");
  });
  it("rejects mismatched orders/amounts and untrusted redirects", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    for (const extra of [
      { OrderId: "another" },
      { Amount: 1 },
      { PaymentURL: "https://attacker.invalid/" },
    ]) {
      fetch.mockResolvedValueOnce(
        response({
          ...identity,
          PaymentURL: "https://securepay.tinkoff.ru/new/fixture",
          ...extra,
        }),
      );
      await expect(initTbankPayment(init, config)).rejects.toThrow(
        "could not be safely applied",
      );
    }
    expect(
      isTrustedPaymentUrl("https://securepay.tinkoff.ru@attacker.invalid/"),
    ).toBe(false);
    expect(isTrustedPaymentUrl("https://securepay.tinkoff.ru:444/new/a")).toBe(
      false,
    );
    expect(isTrustedPaymentUrl("http://securepay.tinkoff.ru/new/a")).toBe(
      false,
    );
  });
  it("does not send credentials to a substituted API host", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    await expect(
      initTbankPayment(init, {
        ...config,
        apiUrl: "https://attacker.invalid/v2",
      }),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("bounds the response stream and keeps bank details out of exceptions", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    fetch.mockResolvedValueOnce(new Response("x".repeat(64001)));
    await expect(initTbankPayment(init, config)).rejects.toThrow(
      "could not be safely applied",
    );
    fetch.mockResolvedValueOnce(
      response({
        ...identity,
        Success: false,
        ErrorCode: "7",
        Details: "private fixture receipt details",
      }),
    );
    await expect(initTbankPayment(init, config)).rejects.toThrow(
      "could not be safely applied",
    );
  });
  it("validates GetState and CheckOrder identities without inventing recovery URLs", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    fetch.mockResolvedValueOnce(response({ ...identity, Amount: "19900" }));
    expect((await getTbankPaymentState("12345", config)).Amount).toBe(19900);
    fetch.mockResolvedValueOnce(
      response({
        ...identity,
        Payments: [{ PaymentId: "12345", Amount: 19900, Status: "NEW" }],
      }),
    );
    const order = await checkTbankOrder("fixture-order", config);
    expect(order.Payments).toHaveLength(1);
    expect(order).not.toHaveProperty("PaymentURL");
    fetch.mockResolvedValueOnce(
      response({
        ...identity,
        Payments: [
          { PaymentId: "12345", Amount: 19900, Status: "NEW" },
          { PaymentId: "12345", Amount: 19900, Status: "NEW" },
        ],
      }),
    );
    await expect(checkTbankOrder("fixture-order", config)).rejects.toThrow();
  });
  it("reuses the supplied full-refund key without guessing a refund amount", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(response({ ...identity, Status: "REFUNDED" }));
    await cancelTbankPayment(
      { paymentId: "12345", externalRequestId: "fixture_refund_001" },
      config,
    );
    const body = JSON.parse(fetch.mock.calls[0][1]!.body as string);
    expect(body.ExternalRequestId).toBe("fixture_refund_001");
    expect(body.Amount).toBeUndefined();
    expect(body.Receipt).toBeUndefined();
  });
});
