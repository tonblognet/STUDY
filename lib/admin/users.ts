import type { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/db";
import { getActiveSession } from "@/lib/auth/session";
import {
  readActiveSession,
  type ActiveSession,
} from "@/lib/auth/session-access";
import { hasValidOrigin } from "@/lib/security/request";
import {
  adminRoleChangeSchema,
  adminUserListSchema,
  canChangeUserRole,
  canManageStaff,
  removesLastSuperadmin,
  userLockOrder,
  type StaffRole,
} from "./user-policy";

export class AdminUsersError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

// Account identifiers and authorization versions only; no applicant profiles,
// credentials, email addresses or challenge/session identifiers leave this API.
const userSelect = { id: true, role: true, authVersion: true } as const;
export type AdminUserView = {
  id: string;
  role: StaffRole;
  authVersion: number;
};
export type AdminUserList = {
  items: AdminUserView[];
  page: number;
  pageSize: number;
  total: number;
};

export async function adminUsersAccess(request: Request, mutation = false) {
  if (mutation && !hasValidOrigin(request))
    throw new AdminUsersError("Некорректный источник запроса", 403);
  const access = await getActiveSession();
  if (!access) throw new AdminUsersError("Требуется вход", 401);
  if (request.headers.get("x-account-id") !== access.user.id)
    throw new AdminUsersError(
      "Аккаунт в другой вкладке изменился. Перезагрузите страницу",
      409,
    );
  if (!canManageStaff(access.user.role))
    throw new AdminUsersError("Доступ запрещён", 403);
  return access;
}

async function currentActor(
  tx: Prisma.TransactionClient,
  access: ActiveSession,
) {
  const active = await readActiveSession(
    { id: access.id, userId: access.user.id },
    tx,
  );
  if (!active) throw new AdminUsersError("Сессия истекла. Войдите снова", 401);
  if (!canManageStaff(active.user.role))
    throw new AdminUsersError("Доступ запрещён", 403);
  return active.user;
}

export async function listAdminUsers(
  access: ActiveSession,
  query: z.infer<typeof adminUserListSchema>,
): Promise<AdminUserList> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${access.user.id} FOR UPDATE`;
    await currentActor(tx, access);
    const where = query.role ? { role: query.role } : {};
    const pageSize = 20;
    const items = await tx.user.findMany({
      where,
      select: userSelect,
      orderBy: { id: "asc" },
      skip: (query.page - 1) * pageSize,
      take: pageSize,
    });
    return {
      items,
      page: query.page,
      pageSize,
      total: await tx.user.count({ where }),
    };
  });
}

export async function changeAdminUserRole(
  access: ActiveSession,
  targetId: string,
  input: z.infer<typeof adminRoleChangeSchema>,
) {
  return prisma.$transaction(async (tx) => {
    // Serialize the last-superadmin invariant before taking any User lock.
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${"postupai:staff-roles"}))`;
    for (const id of userLockOrder(access.user.id, targetId))
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`;
    const actor = await currentActor(tx, access);
    const target = await tx.user.findUnique({
      where: { id: targetId },
      select: userSelect,
    });
    if (!target) throw new AdminUsersError("Аккаунт не найден", 404);
    if (
      !canChangeUserRole(
        actor.role,
        target.role,
        input.role,
        actor.id === target.id,
      )
    )
      throw new AdminUsersError("Эта смена роли запрещена", 403);
    if (target.authVersion !== input.authVersion)
      throw new AdminUsersError(
        "Аккаунт изменился. Обновите список и повторите действие",
        409,
      );
    if (target.role === input.role) return { item: target, changed: false };
    if (
      target.role === "SUPERADMIN" &&
      removesLastSuperadmin(
        target.role,
        input.role,
        await tx.user.count({ where: { role: "SUPERADMIN" } }),
      )
    )
      throw new AdminUsersError(
        "Нельзя удалить последнего суперадминистратора",
        409,
      );
    const item = await tx.user.update({
      where: { id: targetId },
      data: { role: input.role, authVersion: { increment: 1 } },
      select: userSelect,
    });
    const now = new Date();
    await tx.session.updateMany({
      where: { userId: targetId, revokedAt: null },
      data: { revokedAt: now },
    });
    await tx.authChallenge.updateMany({
      where: { userId: targetId, usedAt: null },
      data: { usedAt: now },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "CHANGE_USER_ROLE",
        entityType: "User",
        entityId: targetId,
        before: { role: target.role },
        after: { role: item.role },
      },
    });
    return { item, changed: true };
  });
}
