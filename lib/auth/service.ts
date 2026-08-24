import { createHash, randomInt } from "node:crypto";
import type { Role, User } from "@prisma/client";
import { prisma } from "@/db";
import {
  createOpaqueToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from "@/lib/auth/crypto";
import { getEmailProvider } from "@/lib/notifications/email";

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;
const TWO_FACTOR_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type SafeUser = Pick<
  User,
  "id" | "email" | "name" | "role" | "emailVerified" | "emailTwoFactorEnabled"
>;

export async function registerUser(input: {
  email: string;
  name: string;
  password: string;
}) {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (existing) return { accepted: true } as const;

  const passwordHash = await hashPassword(input.password);
  const { token, tokenHash } = createOpaqueToken();
  await prisma.$transaction(async (tx) => {
    await tx.user.create({
      data: { email: input.email, name: input.name, passwordHash },
    });
    await tx.verificationToken.create({
      data: {
        identifier: input.email,
        tokenHash,
        expires: new Date(Date.now() + VERIFY_TTL_MS),
      },
    });
  });
  const url = new URL(
    "/verify-email",
    process.env.APP_URL ?? "http://localhost:3000",
  );
  url.searchParams.set("token", token);
  await getEmailProvider().send({
    to: input.email,
    subject: "Подтвердите email — Поступай",
    text: `Подтвердите адрес: ${url.toString()}\nСсылка действует 24 часа.`,
  });
  return { accepted: true } as const;
}

export async function verifyEmailToken(token: string) {
  const tokenHash = hashToken(token);
  return prisma.$transaction(async (tx) => {
    const record = await tx.verificationToken.findUnique({
      where: { tokenHash },
    });
    if (!record || record.expires <= new Date()) return false;
    await tx.user.update({
      where: { email: record.identifier },
      data: { emailVerified: new Date() },
    });
    await tx.verificationToken.deleteMany({
      where: { identifier: record.identifier },
    });
    return true;
  });
}

export async function authenticate(
  email: string,
  password: string,
): Promise<SafeUser | null> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (
    !user?.passwordHash ||
    !(await verifyPassword(password, user.passwordHash))
  )
    return null;
  return user;
}

export async function createSession(
  userId: string,
  context: { ipHash?: string; userAgent?: string },
) {
  const { token, tokenHash } = createOpaqueToken();
  const expires = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({
    data: {
      userId,
      tokenHash,
      expires,
      ipHash: context.ipHash,
      userAgentHash: context.userAgent
        ? createHash("sha256").update(context.userAgent).digest("hex")
        : undefined,
    },
  });
  return { token, expires };
}

export async function createTwoFactorChallenge(user: SafeUser) {
  const code = randomInt(100000, 1000000).toString();
  const record = await prisma.authChallenge.create({
    data: {
      userId: user.id,
      type: "EMAIL_2FA",
      tokenHash: hashToken(code),
      expiresAt: new Date(Date.now() + TWO_FACTOR_TTL_MS),
    },
  });
  await getEmailProvider().send({
    to: user.email,
    subject: "Код входа — Поступай",
    text: `Код входа: ${code}. Он действует 10 минут.`,
  });
  return record.id;
}

export async function consumeTwoFactorChallenge(
  challengeId: string,
  code: string,
) {
  return prisma.$transaction(async (tx) => {
    const record = await tx.authChallenge.findUnique({
      where: { id: challengeId },
      include: { user: true },
    });
    if (
      !record ||
      record.usedAt ||
      record.expiresAt <= new Date() ||
      record.attempts >= 5
    )
      return null;
    if (record.tokenHash !== hashToken(code)) {
      await tx.authChallenge.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      return null;
    }
    await tx.authChallenge.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });
    return record.user;
  });
}

export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });
  if (!user) return;
  const { token, tokenHash } = createOpaqueToken();
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expires: new Date(Date.now() + RESET_TTL_MS),
    },
  });
  const url = new URL(
    "/reset-password",
    process.env.APP_URL ?? "http://localhost:3000",
  );
  url.searchParams.set("token", token);
  await getEmailProvider().send({
    to: user.email,
    subject: "Сброс пароля — Поступай",
    text: `Задайте новый пароль: ${url.toString()}\nСсылка действует 30 минут.`,
  });
}

export async function resetPassword(token: string, password: string) {
  const tokenHash = hashToken(token);
  const passwordHash = await hashPassword(password);
  return prisma.$transaction(async (tx) => {
    const record = await tx.passwordResetToken.findUnique({
      where: { tokenHash },
    });
    if (!record || record.usedAt || record.expires <= new Date()) return false;
    await tx.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    });
    await tx.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });
    await tx.session.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return true;
  });
}

export async function revokeSession(token: string) {
  await prisma.session.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllSessions(userId: string) {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function roleAtLeast(role: Role, allowed: Role[]) {
  return allowed.includes(role);
}
