import type { Prisma } from "@prisma/client";
import { prisma } from "@/db";
import type { UserState } from "./types";

type AuthenticatedUser = { id: string; email: string; name?: string | null };

const emptyState: UserState = {
  favoriteIds: [],
  comparisonIds: [],
  scoreSets: [],
};

export async function loadUserState(
  user: AuthenticatedUser,
): Promise<UserState> {
  const snapshot = await prisma.userStateSnapshot.findUnique({
    where: { userId: user.id },
  });
  if (!snapshot) return emptyState;
  return snapshot.state as unknown as UserState;
}

export async function saveUserState(
  user: AuthenticatedUser,
  state: UserState,
): Promise<UserState> {
  await prisma.$transaction([
    prisma.userStateSnapshot.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        state: state as unknown as Prisma.InputJsonValue,
      },
      update: { state: state as unknown as Prisma.InputJsonValue },
    }),
    prisma.auditLog.create({
      data: {
        actorId: user.id,
        action: "SYNC_USER_STATE",
        entityType: "USER_STATE",
        entityId: user.id,
        after: {
          favorites: state.favoriteIds.length,
          comparison: state.comparisonIds.length,
          scoreProfiles: state.scoreSets.length,
        },
      },
    }),
  ]);
  return state;
}
