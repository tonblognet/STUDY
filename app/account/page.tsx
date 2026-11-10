import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountSavedPrograms } from "@/components/account-saved-programs";
import { AdmissionTracker } from "@/components/admission-tracker";
import {
  AccountSecurity,
  AccountNotifications,
} from "@/components/account-settings";
import { ExamMatcher } from "@/components/exam-matcher";
import { LogoutButton } from "@/components/logout-button";
import { UserStateStatus } from "@/components/user-state-provider";
import { getSessionUser } from "@/lib/auth/session";
import { getCatalog } from "@/lib/catalog/server";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Личный кабинет",
  robots: { index: false, follow: false },
};

export default async function AccountPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?returnTo=/account");
  const { programs } = await getCatalog();
  return (
    <div className="account-page">
      <div className="dashboard-head">
        <div>
          <span className="overline">Личный кабинет</span>
          <h1>Мой маршрут</h1>
          <p>{user.name ?? user.email} · личный план поступления</p>
        </div>
        <LogoutButton />
      </div>
      <nav className="account-nav" aria-label="Разделы кабинета">
        <a href="#profile">Профиль ЕГЭ</a>
        <a href="#saved">Сохранённое</a>
        <a href="#tracker">Трекер</a>
        <a href="#notifications">Уведомления</a>
        <a href="#security">Безопасность</a>
        <Link href="/account/billing">Оплаты и доступ</Link>
        <Link href="/support#history">Поддержка</Link>
      </nav>
      <UserStateStatus />
      <section id="profile" className="account-section">
        <div className="section-intro">
          <div>
            <h2>Профиль абитуриента</h2>
            <p>
              Баллы используются только для подбора. Они не отправляются вузам и
              AI без отдельного разрешения.
            </p>
          </div>
        </div>
        <ExamMatcher programs={programs} compact />
      </section>
      <section id="saved" className="account-section">
        <AccountSavedPrograms programs={programs} />
      </section>
      <section id="tracker" className="account-section">
        <div className="section-intro">
          <div>
            <h2>Трекер поступления</h2>
            <p>
              Добавленные программы появятся здесь с приоритетом, этапом,
              дедлайном и историей изменений.
            </p>
          </div>
          <Link href="/programs" className="button button-primary">
            Добавить программу
          </Link>
        </div>
        <AdmissionTracker programs={programs} />
      </section>
      <section id="notifications" className="account-section">
        <AccountNotifications />
      </section>
      <section id="security" className="account-section">
        <AccountSecurity enabled={user.emailTwoFactorEnabled} />
      </section>
    </div>
  );
}
