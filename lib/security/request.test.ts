import { afterEach, describe, expect, it, vi } from "vitest";
import { hasValidOrigin } from "./request";

afterEach(() => vi.unstubAllEnvs());

describe("public origin behind a reverse proxy", () => {
  it("accepts configured public Origin despite an internal HTTP request URL", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "https://postupai.ru");
    expect(
      hasValidOrigin(
        new Request("http://web:3000/api/checkout", {
          headers: { origin: "https://postupai.ru" },
        }),
      ),
    ).toBe(true);
  });
  it("rejects matching attacker Host/Origin and forwarded-host values", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "https://postupai.ru");
    expect(
      hasValidOrigin(
        new Request("https://attacker.invalid/api/checkout", {
          headers: {
            origin: "https://attacker.invalid",
            "x-forwarded-host": "postupai.ru",
          },
        }),
      ),
    ).toBe(false);
  });
  it("fails closed for missing production APP_URL or a nonserialized Origin", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "");
    const request = new Request("https://postupai.ru/api/checkout", {
      headers: { origin: "https://postupai.ru" },
    });
    expect(hasValidOrigin(request)).toBe(false);
    vi.stubEnv("APP_URL", "https://postupai.ru");
    request.headers.set("origin", "https://postupai.ru/elsewhere");
    expect(hasValidOrigin(request)).toBe(false);
  });
});
