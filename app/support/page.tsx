import Link from "next/link";

export const metadata = { title: "Поддержка" };

export default function SupportPage() {
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();
  return <div className="page-shell container support-page">
    <header className="support-hero"><div><span className="overline">Поддержка</span><h1>Поможем разобраться с данными</h1><p>Сообщите, если официальный документ не открывается, показатель относится к другому году или карточка программы содержит неточность.</p></div><div className="support-contact-card"><span>Основной канал</span>{supportEmail ? <a href={`mailto:${supportEmail}`}><strong>{supportEmail}</strong><small>Ответим по электронной почте</small></a> : <><strong>Канал готовится</strong><small>Адрес появится после подключения и проверки доменной почты. Мы не показываем неработающий контакт.</small></>}</div></header>
    <section className="support-grid">
      <article><span>01</span><h2>Ошибка в данных</h2><p>Приложите ссылку на программу, спорное значение и официальный документ, если он у вас есть.</p><Link href="/programs">Найти программу →</Link></article>
      <article><span>02</span><h2>Проблема со входом</h2><p>Укажите страницу и текст ошибки. Никогда не присылайте пароль, код подтверждения или данные карты.</p><Link href="/login">Проверить вход →</Link></article>
      <article><span>03</span><h2>Оплата</h2><p>До боевого запуска платежей списаний быть не должно. После запуска для обращения понадобится только идентификатор платежа.</p><Link href="/pricing">Условия тарифов →</Link></article>
    </section>
    <div className="trust-warning"><b>Безопасность обращения.</b> Поддержка не просит пароль, CVV/CVC, полный номер карты или доступ к аккаунту на Госуслугах.</div>
  </div>;
}
