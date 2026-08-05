"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { ProgramCard } from "@/components/program-card";
import { DataStatusBadge } from "@/components/data-status";
import { SavedProgramActions } from "@/components/saved-program-actions";
import { STORAGE_KEYS } from "@/lib/admissions/storage";
import type { Program } from "@/lib/data";
import { formatPrice } from "@/lib/data";

type CatalogView = "grid" | "table";

export function CatalogClient({ items, initialQuery = "" }: { items: Program[]; initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [subject, setSubject] = useState("Все предметы");
  const [level, setLevel] = useState("Все уровни");
  const [form, setForm] = useState("Все формы");
  const [status, setStatus] = useState("Все статусы");
  const [dvi, setDvi] = useState(false);
  const [budget, setBudget] = useState(0);
  const [sort, setSort] = useState("quality");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const view = useSyncExternalStore(
    (onChange) => { window.addEventListener("postupai:storage", onChange); return () => window.removeEventListener("postupai:storage", onChange); },
    () => { const saved = window.localStorage.getItem(STORAGE_KEYS.catalogView); return saved === "table" ? "table" : "grid"; },
    () => "grid",
  ) as CatalogView;
  const [loading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function changeView(next: CatalogView) {
    try {
      window.localStorage.setItem(STORAGE_KEYS.catalogView, next);
      window.dispatchEvent(new CustomEvent("postupai:storage", { detail: { key: STORAGE_KEYS.catalogView } }));
    } catch { setError("Режим изменён не был: локальное хранилище недоступно."); }
  }

  function reset() {
    setQuery(""); setSubject("Все предметы"); setLevel("Все уровни"); setForm("Все формы"); setStatus("Все статусы"); setDvi(false); setBudget(0);
  }

  const subjects = useMemo(() => [...new Set(items.flatMap((item) => item.examRequirements.flatMap((requirement) => requirement.subjects)))].sort(), [items]);
  const filtered = useMemo(() => {
    const normalized = query.toLowerCase().trim();
    return items.filter((item) =>
      (!normalized || `${item.title} ${item.code} ${item.university} ${item.universityShort}`.toLowerCase().includes(normalized)) &&
      (subject === "Все предметы" || item.examRequirements.some((requirement) => requirement.subjects.includes(subject))) &&
      (level === "Все уровни" || item.level === level) &&
      (form === "Все формы" || item.form === form) &&
      (status === "Все статусы" || item.trust.status === status) &&
      (!dvi || Boolean(item.dvi)) &&
      (budget === 0 || (item.budgetPlaces !== null && item.budgetPlaces >= budget))
    ).sort((a, b) => {
      if (sort === "score") return (a.passingScore ?? Number.MAX_SAFE_INTEGER) - (b.passingScore ?? Number.MAX_SAFE_INTEGER);
      if (sort === "price") return (a.tuition ?? Number.MAX_SAFE_INTEGER) - (b.tuition ?? Number.MAX_SAFE_INTEGER);
      if (sort === "places") return (b.budgetPlaces ?? -1) - (a.budgetPlaces ?? -1);
      return b.trust.completeness - a.trust.completeness;
    });
  }, [items, query, subject, level, form, status, dvi, budget, sort]);

  return <div className="catalog-layout trust-catalog">
    <aside className={filtersOpen ? "filters open" : "filters"} aria-label="Фильтры программ">
      <div className="filters-title"><strong>Фильтры</strong><button type="button" onClick={reset}>Сбросить</button></div>
      <label>Предмет ЕГЭ<select value={subject} onChange={(event) => setSubject(event.target.value)}><option>Все предметы</option>{subjects.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label>Уровень<select value={level} onChange={(event) => setLevel(event.target.value)}><option>Все уровни</option><option>Бакалавриат</option><option>Специалитет</option></select></label>
      <label>Форма<select value={form} onChange={(event) => setForm(event.target.value)}><option>Все формы</option><option>Очная</option><option>Очно-заочная</option><option>Заочная</option></select></label>
      <label>Достоверность<select value={status} onChange={(event) => setStatus(event.target.value)}><option>Все статусы</option><option value="verified">Проверено</option><option value="pending_review">Ожидает проверки</option><option value="outdated">Устарело</option><option value="conflicting_sources">Источники расходятся</option></select></label>
      <label>Минимум бюджетных мест <b>{budget || "не важно"}</b><input type="range" min="0" max="180" step="5" value={budget} onChange={(event) => setBudget(Number(event.target.value))}/></label>
      <label className="check"><input type="checkbox" checked={dvi} onChange={(event) => setDvi(event.target.checked)}/><span>Только с ДВИ</span></label>
      <div className="source-policy"><b>Как читаются данные</b><p>Неизвестное значение всегда показано как «нет данных», а не как ноль. Год относится к показателю, а не ко всей карточке.</p><Link href="/methodology">Методология →</Link></div>
    </aside>
    <section className="catalog-results" aria-live="polite">
      <div className="catalog-toolbar">
        <div className="catalog-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Программа, код или вуз" aria-label="Поиск по каталогу"/></div>
        <button type="button" className="filter-toggle" onClick={() => setFiltersOpen(!filtersOpen)} aria-expanded={filtersOpen}>Фильтры</button>
        <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Сортировка"><option value="quality">Сначала полнее</option><option value="score">По проходному баллу</option><option value="price">По стоимости</option><option value="places">По бюджетным местам</option></select>
        <div className="view-switch" role="group" aria-label="Режим отображения"><button type="button" className={view === "grid" ? "active" : ""} onClick={() => changeView("grid")} aria-pressed={view === "grid"}>Сетка</button><button type="button" className={view === "table" ? "active" : ""} onClick={() => changeView("table")} aria-pressed={view === "table"}>Таблица</button></div>
      </div>
      <div className="stale-notice" role="note"><b>Годы различаются.</b> Планы и цены 2026 не являются проходными баллами 2026: итоговые баллы этой кампании появятся только после зачисления.</div>
      <div className="results-count"><strong>{filtered.length}</strong> программ <span>· 10 официальных источников первой очереди</span></div>
      {loading ? (
        <CatalogSkeleton/>
      ) : error ? (
        <div className="catalog-error" role="alert"><b>Каталог открыт с ограничениями</b><p>{error}</p><button type="button" className="button button-primary" onClick={() => setError(null)}>Повторить</button></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state"><b>Подтверждённых совпадений нет</b><p>Попробуйте ослабить фильтры. Неизвестные значения не считаются подходящими автоматически.</p><button type="button" className="button button-primary" onClick={reset}>Сбросить фильтры</button></div>
      ) : view === "grid" ? (
        <div className="catalog-list">{filtered.map((item) => <ProgramCard program={item} key={item.id}/>)}</div>
      ) : (
        <ProgramTable items={filtered}/>
      )}
    </section>
  </div>;
}

function ProgramTable({ items }: { items: Program[] }) {
  return <div className="program-table-wrap" tabIndex={0} aria-label="Таблица программ. Доступна горизонтальная прокрутка.">
    <table className="program-table">
      <thead><tr><th>Программа</th><th>Условия</th><th>Места</th><th>Проходной</th><th>Стоимость</th><th>Достоверность</th><th>Действия</th></tr></thead>
      <tbody>{items.map((item) => <tr key={item.id}>
        <th scope="row"><Link href={`/programs/${item.slug}`}>{item.title}</Link><span>{item.universityShort} · {item.code}</span></th>
        <td><span>{item.level}, {item.form}</span><small>{item.subjects.join(" · ") || "Испытания не сопоставлены"}</small></td>
        <td><b>{item.budgetPlaces ?? "—"} / {item.paidPlaces ?? "—"}</b><small>бюджет / платно · {item.budgetPlacesValue.year}</small></td>
        <td><b>{item.passingScore ?? "—"}</b><small>{item.passingScoreValue.year} · {item.passingScoreValue.status === "verified" ? "итоговый" : "нет подтверждения"}</small></td>
        <td><b>{formatPrice(item.tuition)}</b><small>{item.tuitionValue.year}</small></td>
        <td><DataStatusBadge status={item.trust.status}/><small>полнота {item.trust.completeness}%</small></td>
        <td><SavedProgramActions id={item.id} compact/></td>
      </tr>)}</tbody>
    </table>
  </div>;
}

function CatalogSkeleton() {
  return <div className="catalog-list" aria-label="Загрузка каталога">{[0, 1, 2, 3].map((item) => <div className="catalog-card-skeleton" key={item}><span/><span/><span/></div>)}</div>;
}
