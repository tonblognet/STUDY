import type { ScoreSet } from "./types";

export function makeInitialScoreProfile(): ScoreSet {
  return {
    id: "draft",
    name: "Мой набор",
    scores: { "Русский язык": 80, Математика: 80, Информатика: 80 },
    individualAchievements: 0,
    updatedAt: new Date().toISOString(),
  };
}

export function selectScoreProfile(
  id: string,
  saved: ScoreSet[],
): ScoreSet | undefined {
  return id === "draft"
    ? makeInitialScoreProfile()
    : saved.find((profile) => profile.id === id);
}
