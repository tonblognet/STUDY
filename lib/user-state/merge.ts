import type { ScoreSet } from "@/lib/admissions/types";
import type { UserState } from "./types";

export function mergeUserStates(server: UserState, local: UserState): UserState {
  const profiles = new Map<string, ScoreSet>();
  for (const profile of [...server.scoreSets, ...local.scoreSets]) {
    const current = profiles.get(profile.id);
    if (!current || profile.updatedAt > current.updatedAt) profiles.set(profile.id, profile);
  }

  return {
    favoriteIds: [...new Set([...server.favoriteIds, ...local.favoriteIds])],
    comparisonIds: [...new Set([...server.comparisonIds, ...local.comparisonIds])],
    scoreSets: [...profiles.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
  };
}

export function userStatesEqual(left: UserState, right: UserState): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
