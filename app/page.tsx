import Link from "next/link";
import { ProgramCard } from "@/components/program-card";
import { programs, universities } from "@/lib/data";

const features = [
  ["01", "Данные из первоисточников", "Сохраняем ссылку, дату обновления и статус проверки каждой записи."],
  ["02", "Честное сравнение", "Баллы, места, стоимость и ДВИ в одной таблице — без рекламного ранжирования."],
  ["03", "План поступления", "Сохраните баллы ЕГЭ и соберите сбалансированный список приоритетов."],
];

export default function Home() {
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify({"@context":"https://schema.org","@type":"WebSite",name:"Поступай",url:"https://postupai.example",potentialAction:{"@type":"SearchAction",target:"https://postupai.example/programs?q={search_term_string}","query-input":"required name=search_term_string"}})}} />
    <section className="hero"><div className="hero-orb orb-one"/><div className="hero-orb orb-two"/><div className="container hero-grid">
      <div className="hero-copy"><span className="kicker"><i/> Приемная кампания 2026</span><h1>Твой маршрут<br/>в <em>нужный</em> вуз</h1><p>Сравнивай проходные баллы, бюджетные места и стоимость обучения в московских вузах. Спокойно, понятно, по официальным данным.</p>
        <form className="hero-search" action="/programs"><span>⌕</span><input name="q" aria-label="Поиск программ и вузов" placeholder="Название, направление или код"/><button>Найти программу</button></form>
        <div className="hero-hints"><span>Часто ищут:</span><Link href="/programs?q=информатика">Информатика</Link><Link href="/programs?q=экономика">Экономика</Link><Link href="/programs?q=дизайн">Дизайн</Link></div>
      </div>
      <div className="hero-visual" aria-label="Пример подбора программы"><div className="floating-label label-one">304 <span>проходной</span></div><div className="floating-label label-two">160 <span>мест</span></div><div className="mock-window"><div className="mock-head"><span/><span/><span/><b>Подбор по баллам</b></div><div className="score-row"><div><small>Математика</small><strong>92</strong></div><div><small>Русский</small><strong>88</strong></div><div><small>Информатика</small><strong>96</strong></div></div><div className="match"><div className="match-ring">87%</div><div><small>Лучшее совпадение</small><strong>Программная инженерия</strong><span>НИУ ВШЭ · Москва</span></div></div><div className="mini-bars"><i/><i/><i/><i/><i/></div><Link href="/programs">Смотреть 24 программы →</Link></div></div>
    </div></section>

    <section className="trust-strip"><div className="container"><span>Популярные вузы</span>{universities.slice(0,5).map(u => <Link href={`/universities/${u.slug}`} key={u.id}><b style={{background:u.color}}>{u.shortName.slice(0,1)}</b>{u.shortName}</Link>)}</div></section>

    <section className="section container"><div className="section-head"><div><span className="overline">В фокусе</span><h2>Программы, которые выбирают сейчас</h2></div><Link href="/programs" className="text-link">Весь каталог →</Link></div><div className="program-grid">{programs.slice(0,3).map(program => <ProgramCard program={program} key={program.id}/>)}</div></section>

    <section className="section soft-section"><div className="container"><div className="section-head"><div><span className="overline">Меньше хаоса</span><h2>Всё важное — на одном экране</h2></div><p>Мы превращаем разрозненные страницы приемных комиссий в понятный маршрут поступления.</p></div><div className="feature-grid">{features.map(([n,title,text]) => <article key={n}><span>{n}</span><h3>{title}</h3><p>{text}</p></article>)}</div></div></section>

    <section className="section container compare-preview"><div className="compare-copy"><span className="overline">Сравнение</span><h2>Решение видно<br/>с первого взгляда</h2><p>Добавьте программы в сравнение — покажем различия и подсветим сильные стороны каждой.</p><Link href="/compare" className="button button-primary">Открыть сравнение</Link></div><div className="compare-table"><div className="compare-row compare-header"><span>Показатель</span><strong>ВШЭ</strong><strong>МГТУ</strong></div><div className="compare-row"><span>Проходной балл</span><b>304</b><b className="best">278</b></div><div className="compare-row"><span>Бюджетных мест</span><b>160</b><b className="best">196</b></div><div className="compare-row"><span>Стоимость в год</span><b>720 000 ₽</b><b className="best">426 000 ₽</b></div><div className="compare-row"><span>ДВИ</span><b>Нет</b><b>Нет</b></div></div></section>

    <section className="section premium-section"><div className="container premium-card"><div><span className="kicker light"><i/> Поступай Плюс</span><h2>Не просто список.<br/>Твоя стратегия поступления.</h2><p>История баллов, все места и цены, неограниченное сравнение и уведомления об изменениях.</p><Link href="/pricing" className="button button-light">Попробовать 7 дней бесплатно</Link></div><div className="premium-points"><div><b>03</b><span>года истории баллов</span></div><div><b>∞</b><span>программ в сравнении</span></div><div><b>24/7</b><span>контроль изменений</span></div></div></div></section>

    <section className="section container faq"><div><span className="overline">FAQ</span><h2>Коротко о важном</h2></div><div>{[["Откуда берутся данные?","С официальных страниц вузов, приказов и опубликованных планов приема. У каждой записи есть источник и дата проверки."],["Можно ли доверять прогнозу поступления?","Это ориентир, а не гарантия. Мы используем историю конкурса, но итог зависит от заявлений абитуриентов и правил конкретного года."],["Что доступно бесплатно?","Поиск, карточки программ, предметы ЕГЭ и базовые показатели. Платные функции помогают глубже анализировать и отслеживать изменения."]].map(([q,a]) => <details key={q}><summary>{q}<span>+</span></summary><p>{a}</p></details>)}</div></section>
    <section className="section container final-cta"><span>Готов к выбору?</span><h2>Собери свой список программ сегодня</h2><p>Бесплатно. Без банковской карты.</p><Link href="/register" className="button button-primary">Создать аккаунт</Link></section>
  </>;
}
