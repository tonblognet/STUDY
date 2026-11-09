import Link from "next/link";
import type { Role } from "@prisma/client";

export function AdminNavigation({ role }: { role: Role }) {
  const catalog = ["CONTENT_MANAGER", "ADMIN", "SUPERADMIN"].includes(role);
  const support = ["SUPPORT", "ADMIN", "SUPERADMIN"].includes(role);
  const billing = ["ADMIN", "SUPERADMIN"].includes(role);
  if (!catalog && !support && !billing) return null;
  return (
    <nav className="account-nav" aria-label="Разделы администрирования">
      {catalog && <Link href="/admin">Контент</Link>}
      {catalog && <Link href="/admin/catalog">Импорты и публикации</Link>}
      {support && <Link href="/admin/support">Обращения</Link>}
      {billing && <Link href="/admin/billing">Платежи</Link>}
      {billing && <Link href="/admin/users">Роли сотрудников</Link>}
    </nav>
  );
}
