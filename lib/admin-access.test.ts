import { describe, expect, it } from "vitest";
import { isAdminEmail, parseAdminEmails } from "./admin-access";

describe("admin access", () => {
  it("normalizes and matches configured emails", () => {
    expect(parseAdminEmails(" Admin@Example.ru,editor@example.ru ")).toEqual(new Set(["admin@example.ru", "editor@example.ru"]));
    expect(isAdminEmail("ADMIN@example.ru", "admin@example.ru")).toBe(true);
  });

  it("denies access when allowlist is empty", () => {
    expect(isAdminEmail("admin@example.ru", "")).toBe(false);
  });
});
