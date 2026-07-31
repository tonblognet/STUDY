"use client";

import { useMemo, useState } from "react";
import { ProgramCard } from "@/components/program-card";
import type { Program } from "@/lib/data";

export function CatalogClient({ items, initialQuery = "" }: { items: Program[]; initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [subject, setSubject] = useState("Все предметы");
  const [level, setLevel] = useState("Все уровни");
  const [dvi, setDvi] = useState(false);
  const [budget, setBudget] = useState(0);
  const [sort, setSort] = useState("popular");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtered = useMemo(() => {
    const normalized = query.toLowerCase().trim();
    return items.filter(item => (!normalized || `${item.title} ${item.code} ${item.university} ${item.universityShort}`.toLowerCase().includes(normalized)) && (subject === "Все предметы" || item.subjects.some(s => s.includes(subject))) && (level === "Все уровни" || item.level === level) && (!dvi || Boolean(item.dvi)) && (item.budgetPlaces ?? 0) >= budget).sort((a,b) => sort === "score" ? (a.passingScore ?? 999) - (b.passingScore ?? 999) : sort === "price" ? (a.tuition ?? 9999999) - (b.tuition ?? 9999999) : (b.budgetPlaces ?? 0) - (a.budgetPlaces ?? 0));
  }, [items, query, subject, level, dvi, budget, sort]);
  return <div className="catalog-layout">
    <aside className={filtersOpen ? "filters open" : "filters"}><div className="filters-title"><strong>Фильтры</strong><button onClick={() => {setSubject("Все предметы");setLevel("Все уровни");setDvi(false);setBudget(0)}}>Сбросить</button></div>
      <label>Предмет ЕГЭ<select value={subject} onChange={e => setSubject(e.target.value)}><option>Все предметы</option><option>Математика</option><option>Информатика</option><option>Обществознание</option><option>Литература</option></select></label>
      <label>Уровень<select value={level} onChange={e => setLevel(e.target.value)}><option>Все уровни</option><option>Бакалавриат</option><option>Специалитет</option><option>Магистратура</option></select></label>
      <label>Минимум бюджетных мест <b>{budget || "не важно"}</b><input type="range" min="0" max="180" step="20" value={budget} onChange={e => setBudget(Number(e.target.value))}/></label>
      <label className="check"><input type="checkbox" checked={dvi} onChange={e => setDvi(e.target.checked)}/><span>Только с ДВИ</span></label>
      <div className="premium-filter"><b>Расширенные фильтры</b><p>Стоимость, история баллов и вероятность поступления</p><a href="/pricing">Открыть с Плюс →</a></div>
    </aside>
    <div className="catalog-results"><div className="catalog-toolbar"><div className="catalog-search"><span>⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Программа, код или вуз" aria-label="Поиск по каталогу"/></div><button className="filter-toggle" onClick={() => setFiltersOpen(!filtersOpen)}>Фильтры</button><select value={sort} onChange={e => setSort(e.target.value)} aria-label="Сортировка"><option value="popular">По популярности</option><option value="score">Сначала доступнее</option><option value="price">Сначала дешевле</option></select></div>
      <div className="results-count"><strong>{filtered.length}</strong> программ найдено <span>· данные приемной кампании 2026</span></div>
      <div className="catalog-list">{filtered.length ? filtered.map(item => <ProgramCard program={item} key={item.id}/>) : <div className="empty-state"><b>Ничего не нашлось</b><p>Попробуйте изменить запрос или сбросить часть фильтров.</p><button className="button button-primary" onClick={() => {setQuery("");setSubject("Все предметы");setLevel("Все уровни");setDvi(false);setBudget(0)}}>Сбросить фильтры</button></div>}</div>
    </div>
  </div>;
}
