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
  const favoriteText = favorite ? "В избранном" : "Избранное";
  const favoriteAction = favorite
    ? "Удалить из избранного"
    : "Добавить в избранное";
  const comparisonText = compared
    ? "В сравнении"
    : comparisonFull
      ? "Лимит сравнения: 20"
      : "Сравнить";
  const comparisonAction = compared
    ? "Удалить из сравнения"
    : comparisonFull
      ? "Сравнение заполнено: максимум 20 программ"
      : "Добавить в сравнение";
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
        aria-label={
          compact ? favoriteAction : `${favoriteText}. ${favoriteAction}`
        }
      >
        {favorite ? "♥" : "♡"}
        {!compact && <span>{favoriteText}</span>}
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
          compact
            ? comparisonAction
            : compared
              ? `${comparisonText}. ${comparisonAction}`
              : comparisonFull
                ? `${comparisonText} программ`
                : comparisonText
        }
        title={
          comparisonFull
            ? "В сравнении максимум 20 программ. Удалите одну, чтобы добавить новую"
            : undefined
        }
      >
        ⇄{!compact && <span>{comparisonText}</span>}
      </button>
    </span>
  );
}
