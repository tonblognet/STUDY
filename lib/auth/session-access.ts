import type { Prisma, User } from "@prisma/client";
import { prisma } from "@/db";

export type ActiveSession = { id: string; user: User };

export async function readActiveSession(
  where: Prisma.SessionWhereUniqueInput,
  client: Pick<Prisma.TransactionClient, "session"> = prisma,
): Promise<ActiveSession | null> {
  const session = await client.session.findUnique({
    where,
    include: { user: true },
  });
  if (
    !session ||
    session.revokedAt ||
    session.expires <= new Date() ||
    session.authVersion !== session.user.authVersion
  )
    return null;
  return { id: session.id, user: session.user };
}

export async function lockActiveSession(
  tx: Prisma.TransactionClient,
  access: ActiveSession,
) {
  // Revocation uses this same owner lock. Recheck after waiting, before writes.
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${access.user.id} FOR UPDATE`;
  const current = await readActiveSession(
    { id: access.id, userId: access.user.id },
    tx,
  );
  return current?.user ?? null;
}

export function withActiveSession<T>(
  access: ActiveSession,
  mutate: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return prisma.$transaction(async (tx) => {
    if (!(await lockActiveSession(tx, access))) return null;
    return { value: await mutate(tx) };
  });
}
