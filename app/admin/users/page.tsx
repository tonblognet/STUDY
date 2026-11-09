import Link from "next/link";
import { getActiveSession } from "@/lib/auth/session";
import {
  adminUserListSchema,
  canManageStaff,
  staffRoles,
} from "@/lib/admin/user-policy";
import { AdminUsersError, listAdminUsers } from "@/lib/admin/users";
import { AdminNavigation } from "@/components/admin-navigation";
import { AdminUserRoles } from "@/components/admin-user-roles";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Роли аккаунтов",
  robots: { index: false, follow: false },
};

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; role?: string }>;
}) {
  const access = await getActiveSession();
  if (!access || !canManageStaff(access.user.role))
    return (
      <div className="page-shell">
        <h1>Доступ ограничен</h1>
        <Link href="/login?returnTo=/admin/users">Войти</Link>
      </div>
    );
  const raw = await searchParams;
  const query = adminUserListSchema.safeParse({
    ...(raw.page ? { page: raw.page } : {}),
    ...(raw.role ? { role: raw.role } : {}),
  });
  if (!query.success)
    return (
      <div className="page-shell">
        <h1>Проверьте параметры списка</h1>
        <Link href="/admin/users">Сбросить фильтр</Link>
      </div>
    );
  let result: Awaited<ReturnType<typeof listAdminUsers>> | null = null;
  let failure: unknown;
  try {
    result = await listAdminUsers(access, query.data);
  } catch (error) {
    failure = error;
  }
  if (!result)
    return (
      <div className="page-shell">
        <h1>
          {failure instanceof AdminUsersError
            ? "Доступ ограничен"
            : "Список временно недоступен"}
        </h1>
        <Link href="/admin/users">Обновить страницу</Link>
      </div>
    );
  const href = (page: number) =>
    `/admin/users?${new URLSearchParams({ page: String(page), ...(query.data.role ? { role: query.data.role } : {}) })}`;
  return (
    <div className="admin-page">
      <h1>Роли аккаунтов</h1>
      <AdminNavigation role={access.user.role} />
      <p>
        Смена роли завершит сеансы и незавершённые подтверждения выбранного
        аккаунта. Свою роль изменить нельзя.
      </p>
      <form className="account-controls" action="/admin/users">
        <label>
          Фильтр роли
          <select name="role" defaultValue={query.data.role ?? ""}>
            <option value="">Все роли</option>
            {staffRoles.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </label>
        <button className="button button-secondary">Показать</button>
      </form>
      <p>
        Найдено аккаунтов: {result.total}. Страница {result.page}.
      </p>
      <AdminUserRoles
        key={`${result.page}:${query.data.role ?? "all"}`}
        actorId={access.user.id}
        actorRole={access.user.role}
        initial={result}
        roleFilter={query.data.role}
      />
      <nav className="account-nav" aria-label="Страницы аккаунтов">
        {result.page > 1 && <Link href={href(result.page - 1)}>Назад</Link>}
        {result.page * result.pageSize < result.total && (
          <Link href={href(result.page + 1)}>Далее</Link>
        )}
      </nav>
    </div>
  );
}
