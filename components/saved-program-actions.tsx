"use client";

import { useUserState } from "@/components/user-state-provider";

export function SavedProgramActions({
  id,
  compact = false,
}: {
  id: string;
  compact?: boolean;
}) {
  const {
    favoriteIds,
    comparisonIds,
    toggleFavorite,
    toggleComparison,
    storageMode,
    error,
  } = useUserState();
  const favorite = favoriteIds.includes(id);
  const compared = comparisonIds.includes(id);
  const comparisonFull = !compared && comparisonIds.length >= 20;
  return (
    <span className="saved-actions">
      <button
        type="button"
        disabled={
          storageMode === "loading" ||
          storageMode === "unavailable" ||
          Boolean(error)
        }
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
        disabled={
          storageMode === "loading" ||
          storageMode === "unavailable" ||
          Boolean(error) ||
          comparisonFull
        }
        className={compared ? "active" : ""}
        onClick={() => toggleComparison(id)}
        aria-pressed={compared}
        aria-label={
          compared
            ? "Удалить из сравнения"
            : comparisonFull
              ? "Сравнение заполнено: максимум 20 программ"
              : "Добавить в сравнение"
        }
        title={
          comparisonFull
            ? "В сравнении максимум 20 программ. Удалите одну, чтобы добавить новую"
            : undefined
        }
      >
        ⇄
        {!compact && (
          <span>
            {compared
              ? "В сравнении"
              : comparisonFull
                ? "Лимит сравнения: 20"
                : "Сравнить"}
          </span>
        )}
      </button>
    </span>
  );
}
