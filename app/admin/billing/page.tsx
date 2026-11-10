import Link from "next/link";
import { getActiveSession } from "@/lib/auth/session";
import { getAdminBilling } from "@/lib/payments/service";
import { AdminBilling } from "@/components/admin-billing";
import { AdminNavigation } from "@/components/admin-navigation";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Платежи",
  robots: { index: false, follow: false },
};
export default async function AdminBillingPage() {
  const access = await getActiveSession();
  if (!access || !["ADMIN", "SUPERADMIN"].includes(access.user.role))
    return (
      <div className="page-shell">
        <h1>Доступ ограничен</h1>
        <Link href="/account">В кабинет</Link>
      </div>
    );
  const initial = await getAdminBilling(access, 1);
  return (
    <div className="admin-page">
      <h1>Платежи и сверка</h1>
      <AdminNavigation role={access.user.role} />
      <p>
        Сверяйте неопределённые результаты перед повторными действиями. Возврат
        требует отдельного подтверждения.
      </p>
      <AdminBilling accountId={access.user.id} initial={initial} />
    </div>
  );
}
