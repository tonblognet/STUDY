import type { ScoreSet } from "./types";
import type { UserState } from "@/lib/user-state/types";

export const STORAGE_KEYS = {
  catalogView: "postupai:catalog-view",
  favorites: "postupai:favorites",
  comparison: "postupai:comparison",
  scoreSets: "postupai:score-sets",
} as const;

export function readStoredList(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function writeStoredList(key: string, value: string[]) {
  window.localStorage.setItem(key, JSON.stringify([...new Set(value)]));
  window.dispatchEvent(new CustomEvent("postupai:storage", { detail: { key } }));
}

export function readScoreSets(): ScoreSet[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEYS.scoreSets) ?? "[]");
    return Array.isArray(value) ? value.filter((item) => item && typeof item.id === "string" && typeof item.scores === "object") : [];
  } catch {
    return [];
  }
}

export function writeScoreSets(value: ScoreSet[]) {
  window.localStorage.setItem(STORAGE_KEYS.scoreSets, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent("postupai:storage", { detail: { key: STORAGE_KEYS.scoreSets } }));
}

export function readLocalUserState(): UserState {
  return {
    favoriteIds: readStoredList(STORAGE_KEYS.favorites),
    comparisonIds: readStoredList(STORAGE_KEYS.comparison),
    scoreSets: readScoreSets(),
  };
}

export function writeLocalUserState(state: UserState) {
  writeStoredList(STORAGE_KEYS.favorites, state.favoriteIds);
  writeStoredList(STORAGE_KEYS.comparison, state.comparisonIds);
  writeScoreSets(state.scoreSets);
}

export function clearLocalUserState() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEYS.favorites);
  window.localStorage.removeItem(STORAGE_KEYS.comparison);
  window.localStorage.removeItem(STORAGE_KEYS.scoreSets);
  window.dispatchEvent(new CustomEvent("postupai:storage", { detail: { key: "user-state" } }));
}
