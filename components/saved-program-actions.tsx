"use client";

import { useUserState } from "@/components/user-state-provider";

export function SavedProgramActions({
  id,
  compact = false,
}: {
  id: string;
  compact?: boolean;
}) {
  const { favoriteIds, comparisonIds, toggleFavorite, toggleComparison } =
    useUserState();
  const favorite = favoriteIds.includes(id);
  const compared = comparisonIds.includes(id);
  return (
    <span className="saved-actions">
      <button
        type="button"
        className={favorite ? "active" : ""}
        onClick={() => toggleFavorite(id)}
        aria-pressed={favorite}
        aria-label={favorite ? "Удалить из избранного" : "Добавить в избранное"}
      >
        {favorite ? "♥" : "♡"}
        {!compact && <span>{favorite ? "В избранном" : "Избранное"}</span>}
      </button>
      <button
        type="button"
        className={compared ? "active" : ""}
        onClick={() => toggleComparison(id)}
        aria-pressed={compared}
        aria-label={compared ? "Удалить из сравнения" : "Добавить в сравнение"}
      >
        ⇄{!compact && <span>{compared ? "В сравнении" : "Сравнить"}</span>}
      </button>
    </span>
  );
}
