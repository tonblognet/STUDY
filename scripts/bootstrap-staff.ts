import { prisma } from "../db/index";

async function bootstrap() {
  const target = process.env.BOOTSTRAP_USER_ID;
  if (
    process.argv.length !== 3 ||
    process.argv[2] !== "--apply" ||
    !target ||
    !/^c[a-z0-9]{8,39}$/.test(target) ||
    !["staging", "production"].includes(process.env.DEPLOYMENT_MODE ?? "") ||
    !process.env.DATABASE_URL
  )
    throw new Error(
      "Explicit verified target and deployment configuration required",
    );
  await prisma.$transaction(async (tx) => {
    // Share the administrative role invariant with the web role commands.
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${"postupai:staff-roles"}))`;
    if (await tx.user.count({ where: { role: "SUPERADMIN" } }))
      throw new Error("First-superadmin bootstrap already completed");
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${target} FOR UPDATE`;
    const user = await tx.user.findUnique({
      where: { id: target },
      select: { emailVerified: true, passwordHash: true, role: true },
    });
    if (!user?.emailVerified || !user.passwordHash || user.role !== "USER")
      throw new Error(
        "Target must be an existing verified password account with USER role",
      );
    const now = new Date();
    await tx.user.update({
      where: { id: target },
      data: { role: "SUPERADMIN", authVersion: { increment: 1 } },
    });
    await tx.session.updateMany({
      where: { userId: target, revokedAt: null },
      data: { revokedAt: now },
    });
    await tx.authChallenge.updateMany({
      where: { userId: target, usedAt: null },
      data: { usedAt: now },
    });
    await tx.auditLog.create({
      data: {
        action: "BOOTSTRAP_SUPERADMIN",
        entityType: "User",
        entityId: target,
        before: { role: "USER" },
        after: { role: "SUPERADMIN" },
      },
    });
  });
  console.log("Initial SUPERADMIN assigned. The account must sign in again.");
}

void bootstrap()
  .catch(() => {
    console.error(
      "Bootstrap rejected or failed. Verify the approved account and database state.",
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
