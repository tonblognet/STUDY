import type { ScoreSet } from "./types";

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
