import type { Prisma } from "@prisma/client";
import { prisma } from "@/db";
import {
  withActiveSession,
  type ActiveSession,
} from "@/lib/auth/session-access";
import { EMPTY_USER_STATE, type UserState } from "./types";
import { normalizeUserState, userStateSchema } from "./validation";
type AuthenticatedUser = { id: string };
export class StateConflict extends Error {}
export async function loadUserState(user: AuthenticatedUser) {
  const snapshot = await prisma.userStateSnapshot.findUnique({
    where: { userId: user.id },
  });
  return {
    state: snapshot ? userStateSchema.parse(snapshot.state) : EMPTY_USER_STATE,
    version: snapshot?.version ?? 0,
  };
}
export async function saveUserState(
  access: ActiveSession,
  requestedState: UserState,
  version: number,
  allowedProgramIds: ReadonlySet<string>,
) {
  const user = access.user;
  return withActiveSession(access, async (tx) => {
    const current = await tx.userStateSnapshot.findUnique({
      where: { userId: user.id },
    });
    if ((current?.version ?? 0) !== version) throw new StateConflict();
    const state = normalizeUserState(
      requestedState,
      allowedProgramIds,
      current ? userStateSchema.parse(current.state) : EMPTY_USER_STATE,
    );
    const saved = await tx.userStateSnapshot.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        state: state as unknown as Prisma.InputJsonValue,
        version: 1,
      },
      update: {
        state: state as unknown as Prisma.InputJsonValue,
        version: { increment: 1 },
      },
    });
    await tx.auditLog.create({
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
    });
    return { state, version: saved.version };
  });
}
