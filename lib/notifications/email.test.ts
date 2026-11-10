import { describe, expect, it } from "vitest";
import { smtpConnectionOptions } from "./email";

describe("SMTP production transport", () => {
  it("requires authenticated TLS and bounds network waits without transport debug logs", () => {
    const result = smtpConnectionOptions(
      "smtp://user:fixture@smtp.example.com:587",
      true,
    );
    expect(result.requireTLS).toBe(true);
    expect(result.tls.rejectUnauthorized).toBe(true);
    expect(result.connectionTimeout).toBeLessThanOrEqual(5000);
    expect(result.socketTimeout).toBeLessThanOrEqual(10000);
    expect(result.debug).toBe(false);
    expect(result.disableFileAccess).toBe(true);
    expect(result.disableUrlAccess).toBe(true);
  });
  it.each([
    "smtp://localhost:1025?ignoreTLS=true",
    "smtp://localhost:1025?tls.rejectUnauthorized=false",
    "smtp://localhost:1025/path",
    "https://smtp.example.com",
  ])(
    "does not accept URL options that can override secure transport settings",
    (url) => {
      expect(() => smtpConnectionOptions(url, true)).toThrow(
        "Invalid SMTP configuration",
      );
    },
  );
  it("allows an isolated nonproduction SMTP fixture without STARTTLS", () => {
    expect(
      smtpConnectionOptions("smtp://127.0.0.1:1026", false).requireTLS,
    ).toBe(false);
  });
});
