import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  // Prisma diagnostics may include query inputs. Application handlers and the
  // instrumentation hook emit allowlisted event fields instead of raw errors.
  new PrismaClient({ log: [] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
