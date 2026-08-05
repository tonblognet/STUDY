"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { DataStatusBadge } from "@/components/data-status";
import { STORAGE_KEYS, readStoredList, writeStoredList } from "@/lib/admissions/storage";
import type { Program } from "@/lib/data";
import { formatPrice } from "@/lib/data";

const rows: Array<{ label: string; render: (program: Program) => React.ReactNode; difference: (program: Program) => string | number | null }> = [
  { label: "Форма и срок", render: (p) => <>{p.form}<small>{p.duration}</small></>, difference: (p) => `${p.form}-${p.duration}` },
  { label: "Проходной балл", render: (p) => <><b>{p.passingScore ?? "Нет данных"}</b><small>{p.passingScoreValue.year}</small><DataStatusBadge status={p.passingScoreValue.status}/></>, difference: (p) => p.passingScore },
  { label: "Бюджетные места", render: (p) => <><b>{p.budgetPlaces ?? "Нет данных"}</b><small>{p.budgetPlacesValue.year}</small><DataStatusBadge status={p.budgetPlacesValue.status}/></>, difference: (p) => p.budgetPlaces },
  { label: "Платные места", render: (p) => <><b>{p.paidPlaces ?? "Нет данных"}</b><small>{p.paidPlacesValue.year}</small><DataStatusBadge status={p.paidPlacesValue.status}/></>, difference: (p) => p.paidPlaces },
  { label: "Стоимость года", render: (p) => <><b>{formatPrice(p.tuition)}</b><small>{p.tuitionValue.year}</small><DataStatusBadge status={p.tuitionValue.status}/></>, difference: (p) => p.tuition },
  { label: "Экзамены", render: (p) => <>{p.subjects.length ? p.subjects.join(" · ") : "Не сопоставлены"}</>, difference: (p) => p.subjects.join("|") },
  { label: "ДВИ", render: (p) => <>{p.dvi ?? "Не требуется / не подтверждено"}<DataStatusBadge status={p.dviValue.status}/></>, difference: (p) => p.dvi },
  { label: "Полнота", render: (p) => <><b>{p.trust.completeness}%</b><DataStatusBadge status={p.trust.status}/></>, difference: (p) => p.trust.completeness },
];

export function ComparisonClient({ programs }: { programs: Program[] }) {
  const fallback = programs.slice(0, 3).map((program) => program.id);
  const storedSnapshot = useSyncExternalStore(
    (onChange) => { window.addEventListener("postupai:storage", onChange); return () => window.removeEventListener("postupai:storage", onChange); },
    () => JSON.stringify(readStoredList(STORAGE_KEYS.comparison)),
    () => "[]",
  );
  const stored = JSON.parse(storedSnapshot) as string[];
  const ids = stored.length ? stored : fallback;
  const selected = useMemo(() => ids.map((id) => programs.find((program) => program.id === id)).filter((program): program is Program => Boolean(program)), [ids, programs]);
  function remove(id: string) { writeStoredList(STORAGE_KEYS.comparison, ids.filter((item) => item !== id)); }

  if (!selected.length) return <div className="empty-page"><span>Сравнение пусто</span><h1>Добавьте программы из каталога</h1><p>В таблицу попадут только выбранные вами программы; неизвестные значения останутся неизвестными.</p><Link className="button button-primary" href="/programs">Открыть каталог</Link></div>;

  return <div className="compare-shell container">
    <header className="compare-head"><span className="overline">Сравнение по подтверждённым значениям</span><h1>Сравните условия, а не рекламу</h1><p>Названия и подписи остаются видимыми при прокрутке. Жёлтая рамка отмечает различия, а статус объясняет качество значения.</p></header>
    <div className="comparison-wrap" tabIndex={0} aria-label="Сравнение программ. Доступна горизонтальная и вертикальная прокрутка.">
      <table className="comparison-table">
        <thead><tr><th>Показатель</th>{selected.map((program) => <th key={program.id}><button type="button" onClick={() => remove(program.id)} aria-label={`Удалить ${program.title} из сравнения`}>×</button><Link href={`/programs/${program.slug}`}>{program.title}</Link><span>{program.universityShort} · {program.code}</span></th>)}</tr></thead>
        <tbody>{rows.map((row) => {
          const values = selected.map(row.difference);
          const differs = new Set(values.map(String)).size > 1;
          return <tr key={row.label}><th scope="row">{row.label}</th>{selected.map((program) => <td className={differs ? "different" : ""} key={program.id}>{row.render(program)}</td>)}</tr>;
        })}</tbody>
      </table>
    </div>
    <p className="compare-note">Архитектура таблицы отделяет строки показателей от колонок программ; это позволит позже сформировать PDF из тех же нормализованных данных.</p>
  </div>;
}
