import { describe, expect, it } from "vitest";
import {
  canChangeUserRole,
  removesLastSuperadmin,
  userLockOrder,
  adminRoleChangeSchema,
} from "./user-policy";

describe("staff role boundary", () => {
  it("keeps support and content editors out of staff management", () => {
    for (const actor of ["USER", "SUPPORT", "CONTENT_MANAGER"] as const) {
      expect(canChangeUserRole(actor, "USER", "SUPPORT", false)).toBe(false);
      expect(canChangeUserRole(actor, "ADMIN", "USER", false)).toBe(false);
    }
  });
  it("protects superadmins and forbids every self role change", () => {
    expect(canChangeUserRole("ADMIN", "SUPERADMIN", "USER", false)).toBe(false);
    expect(canChangeUserRole("ADMIN", "USER", "SUPERADMIN", false)).toBe(false);
    expect(canChangeUserRole("ADMIN", "USER", "SUPPORT", false)).toBe(true);
    expect(canChangeUserRole("SUPERADMIN", "ADMIN", "SUPERADMIN", false)).toBe(
      true,
    );
    expect(canChangeUserRole("SUPERADMIN", "SUPERADMIN", "ADMIN", true)).toBe(
      false,
    );
    expect(removesLastSuperadmin("SUPERADMIN", "ADMIN", 1)).toBe(true);
    expect(removesLastSuperadmin("SUPERADMIN", "ADMIN", 2)).toBe(false);
  });
  it("requires a version and orders both user locks consistently", () => {
    expect(adminRoleChangeSchema.safeParse({ role: "ADMIN" }).success).toBe(
      false,
    );
    expect(
      adminRoleChangeSchema.safeParse({
        role: "ADMIN",
        authVersion: 0,
        email: "injected@example.invalid",
      }).success,
    ).toBe(false);
    expect(userLockOrder("b", "a")).toEqual(userLockOrder("a", "b"));
  });
});
