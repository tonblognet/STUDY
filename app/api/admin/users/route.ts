import { NextResponse } from "next/server";
import { adminUserListSchema } from "@/lib/admin/user-policy";
import {
  adminUsersAccess,
  AdminUsersError,
  listAdminUsers,
} from "@/lib/admin/users";

export async function GET(request: Request) {
  try {
    const access = await adminUsersAccess(request);
    const query = adminUserListSchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!query.success) throw new AdminUsersError("Проверьте параметры списка");
    return NextResponse.json(await listAdminUsers(access, query.data));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof AdminUsersError
            ? error.message
            : "Список временно недоступен",
      },
      { status: error instanceof AdminUsersError ? error.status : 500 },
    );
  }
}
