import type { ScoreSet } from "@/lib/admissions/types";

export type UserState = {
  favoriteIds: string[];
  comparisonIds: string[];
  scoreSets: ScoreSet[];
};

export const EMPTY_USER_STATE: UserState = {
  favoriteIds: [],
  comparisonIds: [],
  scoreSets: [],
};
