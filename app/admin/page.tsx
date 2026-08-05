import { DATA_STATUS_LABELS } from "@/lib/admissions/constants";
import { programs, universities } from "@/lib/data";

export const metadata = { title: "Редакторский контроль данных" };

export default function AdminPage() {
  const verified = programs.filter((program) => program.trust.status === "verified").length;
  const review = programs.length - verified;
  const indicators = programs.flatMap((program) => [program.passingScoreValue, program.budgetPlacesValue, program.paidPlacesValue, program.tuitionValue]);
  const missing = indicators.filter((field) => field.status === "not_published").length;
  return <div className="page-shell container"><div className="admin-head"><div><span className="overline">Редакторская зона</span><h1>Контроль публикации</h1><p>Статусы рассчитаны из текущего проверенного снимка; фиктивные ошибки и счётчики не показываются.</p></div></div><div className="admin-stats"><article><span>Вузов первой очереди</span><strong>{universities.length}</strong><small>официальные домены</small></article><article><span>Программ</span><strong>{programs.length}</strong><small>{verified} с проверенными показателями</small></article><article><span>На проверке</span><strong>{review}</strong><small>не публикуются как полные</small></article><article><span>Не опубликовано</span><strong>{missing}</strong><small>значений, сохранённых как null</small></article></div><section className="admin-panel"><div className="admin-row admin-row-head"><span>Программа</span><span>Статус</span><span>Полнота</span><span>Источник</span></div>{programs.map((program) => <div className="admin-row" key={program.id}><div><b>{program.title}</b><small>{program.universityShort} · {program.code}</small></div><span className={program.trust.status === "verified" ? "status-live" : "status-review"}>{DATA_STATUS_LABELS[program.trust.status]}</span><span>{program.trust.completeness}%</span><a href={program.sourceUrl} target="_blank" rel="noreferrer">Открыть ↗</a></div>)}</section></div>;
}
