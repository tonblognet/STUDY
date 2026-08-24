import { describe, expect, it } from "vitest";
import {
  canChangeRole,
  canEditContent,
  hasEntitlement,
  ownsResource,
  publicProgram,
  type AccessContext,
} from "@/lib/access";

const user = (overrides: Partial<AccessContext> = {}): AccessContext => ({
  userId: "user-a",
  role: "USER",
  entitlements: new Set(),
  ...overrides,
});

describe("authorization policy", () => {
  it("does not derive access from a product name or ordinary role", () => {
    expect(hasEntitlement(user(), "admission_full_data")).toBe(false);
    expect(
      hasEntitlement(
        user({ entitlements: new Set(["admission_full_data"]) }),
        "admission_full_data",
      ),
    ).toBe(true);
  });
  it("enforces ownership", () => {
    expect(ownsResource(user(), "user-a")).toBe(true);
    expect(ownsResource(user(), "user-b")).toBe(false);
  });
  it("does not let content managers or admins promote superadmins", () => {
    expect(canChangeRole(user({ role: "CONTENT_MANAGER" }), "SUPERADMIN")).toBe(
      false,
    );
    expect(canChangeRole(user({ role: "ADMIN" }), "SUPERADMIN")).toBe(false);
    expect(canChangeRole(user({ role: "SUPERADMIN" }), "SUPERADMIN")).toBe(
      true,
    );
  });
  it("allows content roles to edit catalog", () => {
    expect(canEditContent(user({ role: "CONTENT_MANAGER" }))).toBe(true);
    expect(canEditContent(user())).toBe(false);
  });
  it("redacts premium fields at serialization", () => {
    expect(
      publicProgram(
        { previousScores: [1, 2], paidPlaces: 20, tuition: 100, dvi: "exam" },
        false,
      ),
    ).toMatchObject({
      previousScores: [1],
      paidPlaces: null,
      tuition: null,
      dvi: "Доступно с Default",
    });
  });
});
