import Link from "next/link";
import { ExamMatcher } from "@/components/exam-matcher";
import { DataStatusBadge } from "@/components/data-status";
import { programs, universities } from "@/lib/data";

function popularDirections() {
  const groups = new Map<string, typeof programs>();
  for (const program of programs) {
    const key = program.tags[0] ?? program.title;
    groups.set(key, [...(groups.get(key) ?? []), program]);
  }
  return [...groups.entries()].map(([name, items]) => {
    const prices = items.map((item) => item.tuition).filter((value): value is number => value !== null);
    const scores = items.map((item) => item.passingScore).filter((value): value is number => value !== null);
    return {
      name,
      programs: items.length,
      universities: new Set(items.map((item) => item.universitySlug)).size,
      price: prices.length ? `${new Intl.NumberFormat("ru-RU").format(Math.min(...prices))}–${new Intl.NumberFormat("ru-RU").format(Math.max(...prices))} ₽` : "не опубликована",
      score: scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : null,
    };
  }).sort((a, b) => b.programs - a.programs).slice(0, 4);
}
export default function HomePage() {
  const directions = popularDirections();
  const verified = programs.filter((program) => program.trust.status === "verified").length;
  return <div>
    <section className="trust-home-hero"><div className="container trust-home-grid"><div><span className="overline">Приёмная кампания 2026 · официальные источники</span><h1>Проверьте, что сдавать, хватит ли баллов и сколько стоит обучение</h1><p>Мы не обещаем поступление. Сервис показывает год, статус и первоисточник каждого числа — и честно сообщает, если данных пока нет.</p><div className="hero-trust-stats"><span><b>{universities.length}</b> вузов первой очереди</span><span><b>{verified}</b> карточек с проверенными показателями</span><span><b>0</b> неизвестных значений заменено нулём</span></div><div className="hero-actions"><a href="#selection" className="button button-primary">Подобрать по ЕГЭ</a><Link href="/programs" className="button outline-button">Открыть каталог</Link></div></div><aside><div className="trust-sample"><span>Пример проверяемого значения</span><strong>291 балл</strong><p>ВШЭ · Экономика · бюджет · итог приёма 2025</p><DataStatusBadge status="verified"/><a href="https://www.hse.ru/mirror/pubs/share/1162982432.pdf" target="_blank" rel="noreferrer">Официальный документ, стр. 6 ↗</a></div></aside></div></section>
    <div className="container" id="selection"><ExamMatcher programs={programs} compact/></div>
    <section className="direction-facts container"><header><span className="overline">Не рейтинг популярности</span><h2>Направления в текущем проверенном наборе</h2><p>Пока нет аналитики поведения пользователей, блок сгруппирован по тегу программы. Это временный и явно обозначенный алгоритм, а не статистика спроса.</p></header><div>{directions.map((direction) => <article key={direction.name}><h3>{direction.name}</h3><dl><div><dt>Программ</dt><dd>{direction.programs}</dd></div><div><dt>Вузов</dt><dd>{direction.universities}</dd></div><div><dt>Стоимость</dt><dd>{direction.price}</dd></div><div><dt>Типичный опубликованный балл</dt><dd>{direction.score ?? "недостаточно данных"}</dd></div></dl><Link href={`/programs?q=${encodeURIComponent(direction.name)}`}>Посмотреть программы →</Link></article>)}</div></section>
    <section className="home-methodology"><div className="container"><div><span className="overline">Как принимать решение</span><h2>Три проверки вместо длинного лендинга</h2></div><ol><li><b>1</b><span><strong>Подхожу ли я?</strong>Сверьте минимумы, сумму и исторический ориентир.</span></li><li><b>2</b><span><strong>Что сдавать?</strong>Проверьте обязательные, альтернативные предметы и ДВИ.</span></li><li><b>3</b><span><strong>Сколько стоит?</strong>Смотрите цену нужного года и формы обучения.</span></li></ol><Link href="/methodology">Как мы проверяем данные →</Link></div></section>
  </div>;
}

