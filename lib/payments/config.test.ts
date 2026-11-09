import { describe, expect, it } from "vitest";
import {
  buildReceipt,
  getBankConfiguration,
  getCheckoutSettings,
} from "./config";

const configured = {
  PAYMENT_PROVIDER: "tbank",
  PAYMENTS_LIVE: "true",
  TBANK_FISCALIZATION_READY: "true",
  TBANK_TERMINAL_KEY: "fixture-terminal",
  TBANK_PASSWORD: "fixture-password",
  APP_URL: "https://example.invalid",
  TBANK_NOTIFICATION_URL: "https://example.invalid/api/webhooks/payments",
  PAYMENT_ENABLED_PRODUCTS: "default_1",
  TBANK_RECEIPT_TAXATION: "usn_income",
  TBANK_RECEIPT_TAX: "none",
  TBANK_RECEIPT_METHOD: "full_payment",
  TBANK_RECEIPT_OBJECT: "service",
  TBANK_RECEIPT_FFD: "1.2",
  TBANK_RECEIPT_MEASUREMENT_UNIT: "шт",
};
describe("payment activation and receipt", () => {
  it("requires the fiscal scheme and explicit Stage 1 products, beyond a ready flag", () => {
    expect(() => getCheckoutSettings({})).toThrow();
    expect(() =>
      getCheckoutSettings({ ...configured, TBANK_RECEIPT_TAX: undefined }),
    ).toThrow();
    expect(() =>
      getCheckoutSettings({
        ...configured,
        TBANK_RECEIPT_MEASUREMENT_UNIT: undefined,
      }),
    ).toThrow();
    expect(() =>
      getCheckoutSettings({
        ...configured,
        PAYMENT_ENABLED_PRODUCTS: "ai_level_1_request",
      }),
    ).toThrow();
    expect(() =>
      getCheckoutSettings({
        ...configured,
        TBANK_RECEIPT_METHOD: "prepayment",
      }),
    ).toThrow();
  });
  it("builds one amount-matched item with operator-selected fiscal settings", () => {
    const settings = getCheckoutSettings(configured);
    const receipt = buildReceipt(
      settings,
      { name: "Тестовый доступ", amount: 19900 },
      "fixture@example.invalid",
    );
    expect(receipt).toEqual({
      Email: "fixture@example.invalid",
      Taxation: "usn_income",
      Items: [
        {
          Name: "Тестовый доступ",
          Price: 19900,
          Quantity: 1,
          Amount: 19900,
          Tax: "none",
          PaymentMethod: "full_payment",
          PaymentObject: "service",
          MeasurementUnit: "шт",
        },
      ],
    });
    expect(() =>
      buildReceipt(
        settings,
        { name: "Доступ", amount: 19900 },
        `${"a".repeat(60)}@example.invalid`,
      ),
    ).toThrow();
  });
  it("keeps sandbox configuration separate and rejects API URL substitution", () => {
    expect(() =>
      getBankConfiguration({
        ...configured,
        TBANK_API_URL: "https://attacker.invalid/v2",
      }),
    ).toThrow();
    expect(() =>
      getBankConfiguration({
        ...configured,
        TBANK_API_URL: "https://securepay.tinkoff.ru@attacker.invalid/v2",
      }),
    ).toThrow();
    expect(() =>
      getCheckoutSettings({ ...configured, PAYMENTS_LIVE: "false" }),
    ).toThrow();
    expect(
      getCheckoutSettings({
        ...configured,
        PAYMENTS_LIVE: "false",
        TBANK_ENVIRONMENT: "sandbox",
      }).apiUrl,
    ).toBe("https://rest-api-test.tinkoff.ru/v2");
    expect(
      getBankConfiguration({ ...configured, PAYMENT_PROVIDER: "disabled" })
        .terminalKey,
    ).toBe("fixture-terminal");
  });
});
