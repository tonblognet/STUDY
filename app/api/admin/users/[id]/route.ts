import { NextResponse } from "next/server";
import { z } from "zod";
import { adminRoleChangeSchema } from "@/lib/admin/user-policy";
import {
  adminUsersAccess,
  AdminUsersError,
  changeAdminUserRole,
} from "@/lib/admin/users";
import { PayloadTooLarge, readBoundedJson } from "@/lib/security/body";
import { checkRateLimit } from "@/lib/security/rate-limit";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const access = await adminUsersAccess(request, true);
    const { id } = await context.params;
    if (!z.string().cuid().safeParse(id).success)
      throw new AdminUsersError("Аккаунт не найден", 404);
    const parsed = adminRoleChangeSchema.safeParse(
      await readBoundedJson(request, 4000),
    );
    if (!parsed.success)
      throw new AdminUsersError("Укажите роль и текущую версию аккаунта");
    const limit = await checkRateLimit(
      `admin-role:${access.user.id}`,
      40,
      60000,
    );
    if (!limit.allowed)
      throw new AdminUsersError(
        "Слишком много запросов. Попробуйте позже",
        429,
      );
    return NextResponse.json(
      await changeAdminUserRole(access, id, parsed.data),
    );
  } catch (error) {
    const tooLarge = error instanceof PayloadTooLarge;
    return NextResponse.json(
      {
        error: tooLarge
          ? "Запрос слишком большой"
          : error instanceof AdminUsersError
            ? error.message
            : "Не удалось изменить роль",
      },
      {
        status: tooLarge
          ? 413
          : error instanceof AdminUsersError
            ? error.status
            : 500,
      },
    );
  }
}
