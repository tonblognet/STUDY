import { describe, expect, it } from "vitest";
import {
  credentialsSchema,
  registerSchema,
  resetPasswordSchema,
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
  it("rejects passwords that bcrypt would silently truncate", () => {
    const legacyPassword = "Aa1" + "я".repeat(35);
    const token = "x".repeat(32);
    expect(
      registerSchema.safeParse({
        email: "a@example.ru",
        name: "Анна",
        password: legacyPassword,
      }).success,
    ).toBe(false);
    expect(
      resetPasswordSchema.safeParse({ token, password: legacyPassword })
        .success,
    ).toBe(false);
    expect(
      registerSchema.safeParse({
        email: "a@example.ru",
        name: "Анна",
        password: "Aa1" + "x".repeat(69),
      }).success,
    ).toBe(true);
  });
  it("accepts legacy bcrypt passwords at login", () => {
    const password = "Aa1" + "я".repeat(35);
    expect(
      credentialsSchema.safeParse({ email: "a@example.ru", password }).success,
    ).toBe(true);
  });
});
