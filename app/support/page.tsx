import Link from "next/link";
import { SupportInbox } from "@/components/support-inbox";
import { getSessionUser } from "@/lib/auth/session";
import styles from "@/components/support.module.css";

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
      <div className={styles.pageContent}>
        <section>
          {user ? (
            <SupportInbox showCreate />
          ) : (
            <div className="tracker-empty">
              <strong>Войдите, чтобы сохранить историю</strong>
              <p>Ответы поддержки будут доступны в истории обращений.</p>
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
          <h2>Связаться с нами</h2>
          {supportEmail ? (
            <a className="support-email" href={`mailto:${supportEmail}`}>
              {supportEmail}
            </a>
          ) : (
            <p>
              Напишите через форму обращения. Ответ будет доступен в истории.
            </p>
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
