"use client";

import { useSyncExternalStore } from "react";
import { STORAGE_KEYS, readStoredList, writeStoredList } from "@/lib/admissions/storage";

function useStoredToggle(key: string, id: string) {
  const snapshot = useSyncExternalStore(
    (onChange) => { window.addEventListener("postupai:storage", onChange); return () => window.removeEventListener("postupai:storage", onChange); },
    () => JSON.stringify(readStoredList(key)),
    () => "[]",
  );
  const active = (JSON.parse(snapshot) as string[]).includes(id);
  function toggle() {
    const current = readStoredList(key);
    const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    writeStoredList(key, next);
  }
  return [active, toggle] as const;
}

export function SavedProgramActions({ id, compact = false }: { id: string; compact?: boolean }) {
  const [favorite, toggleFavorite] = useStoredToggle(STORAGE_KEYS.favorites, id);
  const [compared, toggleCompared] = useStoredToggle(STORAGE_KEYS.comparison, id);
  return <span className="saved-actions">
    <button type="button" className={favorite ? "active" : ""} onClick={toggleFavorite} aria-pressed={favorite} aria-label={favorite ? "Удалить из избранного" : "Добавить в избранное"}>{favorite ? "♥" : "♡"}{!compact && <span>{favorite ? "В избранном" : "Избранное"}</span>}</button>
    <button type="button" className={compared ? "active" : ""} onClick={toggleCompared} aria-pressed={compared} aria-label={compared ? "Удалить из сравнения" : "Добавить в сравнение"}>⇄{!compact && <span>{compared ? "В сравнении" : "Сравнить"}</span>}</button>
  </span>;
}
