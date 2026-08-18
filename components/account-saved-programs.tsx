"use client";

import Link from "next/link";
import { useUserState } from "@/components/user-state-provider";
import type { Program } from "@/lib/data";

export function AccountSavedPrograms({ programs }: { programs: Program[] }) {
  const { favoriteIds, comparisonIds, toggleFavorite, removeFromComparison, storageMode } = useUserState();
  const favorites = favoriteIds.map((id) => programs.find((program) => program.id === id)).filter((program): program is Program => Boolean(program));
  const comparison = comparisonIds.map((id) => programs.find((program) => program.id === id)).filter((program): program is Program => Boolean(program));

  return <section className="account-saved" aria-labelledby="saved-programs-title">
    <header><div><span className="overline">Мой список</span><h2 id="saved-programs-title">Сохранённые программы</h2></div><span className="storage-mode-label">{storageMode === "account" ? "В аккаунте" : storageMode === "local" ? "На устройстве" : "Загрузка…"}</span></header>
    <div className="account-saved-grid">
      <article>
        <div className="account-saved-head"><h3>Избранное</h3><b>{favorites.length}</b></div>
        {favorites.length ? <ul>{favorites.map((program) => <li key={program.id}><div><Link href={`/programs/${program.slug}`}>{program.title}</Link><span>{program.universityShort} · {program.code}</span></div><button type="button" onClick={() => toggleFavorite(program.id)} aria-label={`Удалить ${program.title} из избранного`}>Удалить</button></li>)}</ul> : <p>Добавьте программы из каталога, чтобы быстро возвращаться к ним.</p>}
        <Link className="text-link" href="/programs">Открыть каталог →</Link>
      </article>
      <article>
        <div className="account-saved-head"><h3>Сравнение</h3><b>{comparison.length}</b></div>
        {comparison.length ? <ul>{comparison.map((program) => <li key={program.id}><div><Link href={`/programs/${program.slug}`}>{program.title}</Link><span>{program.universityShort} · {program.code}</span></div><button type="button" onClick={() => removeFromComparison(program.id)} aria-label={`Удалить ${program.title} из сравнения`}>Удалить</button></li>)}</ul> : <p>Выберите две или больше программы, чтобы увидеть различия в одной таблице.</p>}
        <Link className="text-link" href="/compare">Перейти к сравнению →</Link>
      </article>
    </div>
  </section>;
}
