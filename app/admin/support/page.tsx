import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { SUPPORT_ROLES } from "@/lib/support/policy";
import { AdminNavigation } from "@/components/admin-navigation";
import { SupportInbox } from "@/components/support-inbox";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Обращения поддержки",
  robots: { index: false, follow: false },
};
export default async function SupportAdminPage() {
  const actor = await requireRole(SUPPORT_ROLES);
  if (!actor)
    return (
      <div className="page-shell">
        <h1>Доступ ограничен</h1>
        <p>Очередь доступна сотрудникам поддержки и администраторам.</p>
        <Link href="/login?returnTo=/admin/support">Войти</Link>
      </div>
    );
  return (
    <div className="admin-page">
      <header className="page-title">
        <span className="overline">Поддержка</span>
        <h1>Обращения пользователей</h1>
        <p>Ответы, статусы и целевые сроки в одной очереди.</p>
      </header>
      <AdminNavigation role={actor.role} />
      <SupportInbox staff />
    </div>
  );
}
