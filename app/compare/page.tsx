import Link from "next/link";
import { programs, type Program } from "@/lib/data";

export const metadata = { title: "Сравнение программ" };

export default function ComparePage() {
  const selected = programs.slice(0, 3);
  const rows: [string, (program: Program) => string | number][] = [
    ["Проходной балл", (program) => program.passingScore ?? "—"],
    ["Бюджетных мест", (program) => program.budgetPlaces ?? "—"],
    ["Стоимость", (program) => program.tuition ? `${Math.round(program.tuition / 1000)} тыс. ₽` : "—"],
    ["Форма", (program) => program.form],
    ["Срок", (program) => program.duration],
    ["ДВИ", (program) => program.dvi ?? "Нет"],
  ];
  return <div className="page-shell container">
    <div className="page-title"><span className="overline">Ваш выбор</span><h1>Сравнение программ</h1><p>Ключевые различия трех направлений без лишнего шума.</p></div>
    <div className="comparison-full">
      <div className="comparison-top"><span>Показатель</span>{selected.map(program => <div key={program.id}><b>{program.universityShort}</b><strong>{program.title}</strong><small>{program.code}</small></div>)}</div>
      {rows.map(([label, getValue]) => <div className="comparison-line" key={label}><span>{label}</span>{selected.map(program => <b key={program.id}>{getValue(program)}</b>)}</div>)}
      <div className="comparison-actions"><span />{selected.map(program => <Link key={program.id} className="button outline-button" href={`/programs/${program.slug}`}>Подробнее</Link>)}</div>
    </div>
    <div className="limit-notice"><span>Плюс</span><div><b>Сравнивайте без ограничений</b><p>В бесплатной версии доступно до 3 программ одновременно.</p></div><Link className="button button-primary" href="/pricing">Узнать больше</Link></div>
  </div>;
}
