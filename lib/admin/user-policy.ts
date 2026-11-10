import { z } from "zod";

export const staffRoles = [
  "USER",
  "SUPPORT",
  "CONTENT_MANAGER",
  "ADMIN",
  "SUPERADMIN",
] as const;
export type StaffRole = (typeof staffRoles)[number];

export const adminUserListSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    role: z.enum(staffRoles).optional(),
  })
  .strict();

export const adminRoleChangeSchema = z
  .object({
    role: z.enum(staffRoles),
    authVersion: z.number().int().safe().nonnegative(),
  })
  .strict();

export function canManageStaff(role: StaffRole) {
  return role === "ADMIN" || role === "SUPERADMIN";
}

export function canChangeUserRole(
  actor: StaffRole,
  target: StaffRole,
  next: StaffRole,
  self: boolean,
) {
  if (self) return false;
  if (actor === "SUPERADMIN") return true;
  return actor === "ADMIN" && target !== "SUPERADMIN" && next !== "SUPERADMIN";
}

export function userLockOrder(actorId: string, targetId: string) {
  return [...new Set([actorId, targetId])].sort();
}

export function removesLastSuperadmin(
  target: StaffRole,
  next: StaffRole,
  superadminCount: number,
) {
  return (
    target === "SUPERADMIN" && next !== "SUPERADMIN" && superadminCount <= 1
  );
}
