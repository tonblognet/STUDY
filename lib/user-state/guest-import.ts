import type { ScoreSet } from "@/lib/admissions/types";
import type { UserState } from "./types";

function scoresEqual(
  left: Record<string, number> | undefined,
  right: Record<string, number> | undefined,
) {
  if (!left || !right) return left === right;
  return (
    Object.keys(left).length === Object.keys(right).length &&
    Object.entries(left).every(([subject, score]) => right[subject] === score)
  );
}

function profilesEqual(left: ScoreSet, right: ScoreSet) {
  return (
    left.id === right.id &&
    left.name === right.name &&
    left.updatedAt === right.updatedAt &&
    left.individualAchievements === right.individualAchievements &&
    left.dviScore === right.dviScore &&
    left.dviProgramSlug === right.dviProgramSlug &&
    scoresEqual(left.scores, right.scores) &&
    scoresEqual(left.additionalExamScores, right.additionalExamScores)
  );
}

/** Report unconfirmed guest values; importing never changes the local copy. */
export function getUnimportedGuestState(
  snapshot: UserState,
  acknowledged: UserState,
): UserState {
  return {
    favoriteIds: snapshot.favoriteIds.filter(
      (id) => !acknowledged.favoriteIds.includes(id),
    ),
    comparisonIds: snapshot.comparisonIds.filter(
      (id) => !acknowledged.comparisonIds.includes(id),
    ),
    scoreSets: snapshot.scoreSets.filter(
      (profile) =>
        !acknowledged.scoreSets.some((saved) => profilesEqual(profile, saved)),
    ),
  };
}
