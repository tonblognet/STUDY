import { z } from "zod";
import type { UserState } from "./types";

const scoreSetSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[\p{L}\p{N}_-]+$/u),
  name: z.string().trim().min(1).max(80),
  scores: z.record(
    z.string().trim().min(1).max(80),
    z.number().int().min(0).max(100),
  ),
  individualAchievements: z.number().int().min(0).max(10),
  dviScore: z.number().int().min(0).max(100).optional(),
  updatedAt: z.string().datetime(),
});

export const userStateSchema = z.object({
  favoriteIds: z.array(z.string().trim().min(1).max(100)).max(200),
  comparisonIds: z.array(z.string().trim().min(1).max(100)).max(20),
  scoreSets: z.array(scoreSetSchema).max(8),
});

export function normalizeUserState(
  state: UserState,
  allowedProgramIds: ReadonlySet<string>,
): UserState {
  const uniquePrograms = (ids: string[], limit: number) =>
    [...new Set(ids)].filter((id) => allowedProgramIds.has(id)).slice(0, limit);

  return {
    favoriteIds: uniquePrograms(state.favoriteIds, 200),
    comparisonIds: uniquePrograms(state.comparisonIds, 20),
    scoreSets: [
      ...new Map(state.scoreSets.map((item) => [item.id, item])).values(),
    ]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 8),
  };
}
