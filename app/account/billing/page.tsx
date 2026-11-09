import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { getAccountBilling } from "@/lib/payments/service";
import { BillingHistory } from "@/components/billing-history";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Оплаты и доступ",
  robots: { index: false, follow: false },
};
export default async function AccountBillingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?returnTo=/account/billing");
  const initial = await getAccountBilling(user.id);
  return (
    <div className="page-shell">
      <div className="page-title">
        <h1>Оплаты и доступ</h1>
        <p>История попыток оплаты и подтверждений банка.</p>
      </div>
      <nav className="account-nav" aria-label="Разделы кабинета">
        <Link href="/account">Мой маршрут</Link>
        <Link href="/support#history">Поддержка</Link>
      </nav>
      <BillingHistory accountId={user.id} initial={initial} />
    </div>
  );
}
