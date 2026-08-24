import { describe, expect, it } from "vitest";
import {
  credentialsSchema,
  registerSchema,
  twoFactorSchema,
} from "@/lib/auth/schemas";

describe("auth boundary validation", () => {
  it("normalizes email and accepts a strong password", () => {
    const result = registerSchema.parse({
      email: " User@Example.RU ",
      name: "Анна",
      password: "ReliablePass2027",
    });
    expect(result.email).toBe("user@example.ru");
  });
  it("rejects short or weak passwords", () => {
    expect(
      credentialsSchema.safeParse({
        email: "a@example.ru",
        password: "password",
      }).success,
    ).toBe(false);
  });
  it("accepts only six digit 2FA codes", () => {
    const challengeId = "ckl3m0h1x0000qzrmn831i7rn";
    expect(
      twoFactorSchema.safeParse({ challengeId, code: "123456" }).success,
    ).toBe(true);
    expect(
      twoFactorSchema.safeParse({ challengeId, code: "12ab56" }).success,
    ).toBe(false);
  });
});
