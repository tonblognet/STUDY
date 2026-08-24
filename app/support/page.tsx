import Link from "next/link";
import { SupportTicketForm } from "@/components/support-ticket-form";
import { getSessionUser } from "@/lib/auth/session";

export const metadata = { title: "Поддержка" };
export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const user = await getSessionUser();
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();
  return (
    <div className="page-shell support-page">
      <header className="page-title">
        <span className="overline">Мы рядом</span>
        <h1>Поддержка без лишних кругов</h1>
        <p className="editorial-lead">
          Сообщите об ошибке в данных, входе или оплате. Пароль, код
          подтверждения и реквизиты карты никогда не нужны.
        </p>
      </header>
      <div className="support-route-cards">
        <Link href="/faq">
          <span>Сначала быстро</span>
          <strong>Посмотреть частые вопросы</strong>
          <small>Подбор по ЕГЭ, источники, ВУЦ и общежития →</small>
        </Link>
        <Link href="/methodology">
          <span>О данных</span>
          <strong>Проверить методологию</strong>
          <small>Статусы, обновления и официальные источники →</small>
        </Link>
        <Link href="/programs">
          <span>Вернуться к выбору</span>
          <strong>Открыть каталог программ</strong>
          <small>Фильтры и персональный подбор по ЕГЭ →</small>
        </Link>
      </div>
      <div className="support-layout">
        <section>
          <h2>Создать обращение</h2>
          {user ? (
            <SupportTicketForm />
          ) : (
            <div className="tracker-empty">
              <strong>Войдите, чтобы сохранить историю</strong>
              <p>Ответы поддержки будут доступны в личном кабинете.</p>
              <Link
                href="/login?returnTo=/support"
                className="button button-primary"
              >
                Войти
              </Link>
            </div>
          )}
        </section>
        <aside>
          <h2>Другие каналы</h2>
          {supportEmail ? (
            <a className="support-email" href={`mailto:${supportEmail}`}>
              {supportEmail}
            </a>
          ) : (
            <p>Публичный email появится после подключения доменной почты.</p>
          )}
          <div className="support-rule">
            <strong>Поддержка не попросит</strong>
            <ul>
              <li>пароль или одноразовый код;</li>
              <li>CVV/CVC и полный номер карты;</li>
              <li>доступ к Госуслугам;</li>
              <li>отключить защиту браузера.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
