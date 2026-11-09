import { createHash, createHmac, randomInt, randomUUID } from "node:crypto";
import { Prisma, type Role, type User } from "@prisma/client";
import { prisma } from "@/db";
import {
  createOpaqueToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from "@/lib/auth/crypto";
import { getEmailProvider } from "@/lib/notifications/email";
import {
  lockActiveSession,
  type ActiveSession,
} from "@/lib/auth/session-access";

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 30 * 60 * 1000;
const TWO_FACTOR_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export type SafeUser = Pick<
  User,
  | "id"
  | "email"
  | "name"
  | "role"
  | "emailVerified"
  | "emailTwoFactorEnabled"
  | "authVersion"
>;

async function lockUser(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`;
  return tx.user.findUniqueOrThrow({ where: { id } });
}
async function audit(
  tx: Prisma.TransactionClient,
  userId: string,
  action: string,
) {
  await tx.auditLog.create({
    data: { actorId: userId, action, entityType: "AUTH", entityId: userId },
  });
  const securityMessages: Record<string, string> = {
    RESET_PASSWORD: "Пароль изменён; прежние сессии завершены.",
    ENABLE_2FA: "Включён двухэтапный вход по email.",
    DISABLE_2FA: "Двухэтапный вход по email выключен.",
    REVOKE_ALL_SESSIONS: "Завершены все активные сессии.",
  };
  if (securityMessages[action])
    await tx.notification.create({
      data: {
        userId,
        type: "SECURITY",
        title: "Безопасность аккаунта",
        body: securityMessages[action],
      },
    });
}
function hashCode(nonce: string, code: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("AUTH_SECRET must contain at least 32 characters");
  return createHmac("sha256", secret).update(`${nonce}:${code}`).digest("hex");
}
function actionUrl(path: string, token: string) {
  if (process.env.NODE_ENV === "production" && !process.env.APP_URL)
    throw new Error("APP_URL required");
  const url = new URL(path, process.env.APP_URL ?? "http://localhost:3000");
  url.searchParams.set("token", token);
  return url.toString();
}
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
  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: input.email, name: input.name, passwordHash },
      });
      await audit(tx, user.id, "REGISTER");
    });
  } catch (error) {
    if (
      !(
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
    )
      throw error;
    return { accepted: true } as const;
  }
  await resendVerification(input.email);
  return { accepted: true } as const;
}
export async function resendVerification(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.emailVerified) return;
  const { token, tokenHash } = createOpaqueToken();
  const created = await prisma.$transaction(async (tx) => {
    const current = await lockUser(tx, user.id);
    if (current.emailVerified) return false;
    await tx.verificationToken.deleteMany({ where: { identifier: email } });
    await tx.verificationToken.create({
      data: {
        identifier: email,
        tokenHash,
        expires: new Date(Date.now() + VERIFY_TTL_MS),
      },
    });
    return true;
  });
  if (!created) return;
  await getEmailProvider().send({
    to: email,
    subject: "Подтвердите email — Поступай",
    text: `Если вы регистрировались в «Поступай», откройте ссылку и введите пароль аккаунта: ${actionUrl("/verify-email", token)}\nСсылка действует 24 часа.`,
  });
}
export async function verifyEmailToken(token: string, password: string) {
  const tokenHash = hashToken(token);
  const record = await prisma.verificationToken.findUnique({
    where: { tokenHash },
  });
  if (!record || record.expires <= new Date()) return false;
  const owner = await prisma.user.findUnique({
    where: { email: record.identifier },
    select: { id: true, emailVerified: true, passwordHash: true },
  });
  if (
    !owner?.passwordHash ||
    owner.emailVerified ||
    !(await verifyPassword(password, owner.passwordHash))
  )
    return false;

  return prisma.$transaction(async (tx) => {
    const current = await lockUser(tx, owner.id);
    if (current.emailVerified || current.passwordHash !== owner.passwordHash)
      return false;
    const claimed = await tx.verificationToken.deleteMany({
      where: {
        tokenHash,
        identifier: current.email,
        expires: { gt: new Date() },
      },
    });
    if (!claimed.count) return false;
    await tx.user.update({
      where: { id: owner.id },
      data: { emailVerified: new Date() },
    });
    await audit(tx, owner.id, "VERIFY_EMAIL");
    return true;
  });
}
export async function authenticate(
  email: string,
  password: string,
): Promise<SafeUser | null> {
  const user = await prisma.user.findUnique({ where: { email } });
  // Pay the same bcrypt cost for unknown addresses.
  const hash =
    user?.passwordHash ??
    "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYB1wP8N8LJtQJjz7MeI5E6rLQZ1h0Su";
  if (!(await verifyPassword(password, hash)) || !user?.passwordHash)
    return null;
  return user;
}
export async function createSession(
  userId: string,
  context: { ipHash?: string; userAgent?: string },
  authVersion: number,
) {
  const { token, tokenHash } = createOpaqueToken();
  const expires = new Date(Date.now() + SESSION_TTL_MS);
  return prisma.$transaction(async (tx) => {
    const user = await lockUser(tx, userId);
    if (user.authVersion !== authVersion || !user.emailVerified) return null;
    await tx.session.create({
      data: {
        userId,
        tokenHash,
        expires,
        authVersion,
        ipHash: context.ipHash,
        userAgentHash: context.userAgent
          ? createHash("sha256").update(context.userAgent).digest("hex")
          : undefined,
      },
    });
    await audit(tx, userId, "LOGIN");
    return { token, expires };
  });
}
export async function createTwoFactorChallenge(
  user: SafeUser,
  type = "EMAIL_2FA",
  access?: ActiveSession,
) {
  const code = randomInt(100000, 1000000).toString();
  const nonce = randomUUID();
  const record = await prisma.$transaction(async (tx) => {
    const current = access
      ? await lockActiveSession(tx, access)
      : await lockUser(tx, user.id);
    if (
      !current ||
      current.id !== user.id ||
      current.authVersion !== user.authVersion
    )
      return null;
    await tx.authChallenge.updateMany({
      where: { userId: user.id, type, usedAt: null },
      data: { usedAt: new Date() },
    });
    return tx.authChallenge.create({
      data: {
        userId: user.id,
        type,
        tokenHash: `${nonce}:${hashCode(nonce, code)}`,
        expiresAt: new Date(Date.now() + TWO_FACTOR_TTL_MS),
      },
    });
  });
  if (!record) return null;
  await getEmailProvider().send({
    to: user.email,
    subject: "Код подтверждения — Поступай",
    text: `Код: ${code}. Он действует 10 минут. Если вы не запрашивали действие, не передавайте код.`,
  });
  return record.id;
}
async function claimChallenge(
  tx: Prisma.TransactionClient,
  challengeId: string,
  code: string,
  type: string,
  userId?: string,
) {
  const initial = await tx.authChallenge.findUnique({
    where: { id: challengeId },
  });
  if (!initial || (userId && initial.userId !== userId)) return null;
  const user = await lockUser(tx, initial.userId);
  const record = await tx.authChallenge.findUnique({
    where: { id: challengeId },
  });
  if (
    !record ||
    record.type !== type ||
    record.usedAt ||
    record.expiresAt <= new Date() ||
    record.attempts >= 5
  )
    return null;
  const nonce = record.tokenHash.split(":")[0];
  const valid = record.tokenHash === `${nonce}:${hashCode(nonce, code)}`;
  await tx.authChallenge.update({
    where: { id: challengeId },
    data: {
      attempts: { increment: 1 },
      ...(valid ? { usedAt: new Date() } : {}),
    },
  });
  if (!valid) {
    await audit(tx, user.id, "TWO_FACTOR_FAILED");
    return null;
  }
  return user;
}
export async function consumeTwoFactorChallenge(
  challengeId: string,
  code: string,
) {
  return prisma.$transaction((tx) =>
    claimChallenge(tx, challengeId, code, "EMAIL_2FA"),
  );
}
export async function changeTwoFactor(
  access: ActiveSession,
  challengeId: string,
  code: string,
  enabled: boolean,
) {
  return prisma.$transaction(async (tx) => {
    if (!(await lockActiveSession(tx, access))) return "inactive";
    const userId = access.user.id;
    const user = await claimChallenge(
      tx,
      challengeId,
      code,
      enabled ? "ENABLE_2FA" : "DISABLE_2FA",
      userId,
    );
    if (!user) return "invalid";
    await tx.user.update({
      where: { id: userId },
      data: { emailTwoFactorEnabled: enabled, authVersion: { increment: 1 } },
    });
    await invalidateAccess(tx, userId);
    await audit(tx, userId, enabled ? "ENABLE_2FA" : "DISABLE_2FA");
    return "changed";
  });
}
export async function requestPasswordReset(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;
  const { token, tokenHash } = createOpaqueToken();
  await prisma.$transaction(async (tx) => {
    await lockUser(tx, user.id);
    await tx.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    await tx.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expires: new Date(Date.now() + RESET_TTL_MS),
      },
    });
    await audit(tx, user.id, "REQUEST_PASSWORD_RESET");
  });
  await getEmailProvider().send({
    to: user.email,
    subject: "Сброс пароля — Поступай",
    text: `Задайте новый пароль: ${actionUrl("/reset-password", token)}\nСсылка действует 30 минут.`,
  });
}
async function invalidateAccess(tx: Prisma.TransactionClient, userId: string) {
  await tx.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await tx.authChallenge.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });
}
export async function resetPassword(token: string, password: string) {
  const tokenHash = hashToken(token);
  const initial = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
  });
  if (!initial || initial.usedAt || initial.expires <= new Date()) return false;
  const passwordHash = await hashPassword(password);
  return prisma.$transaction(async (tx) => {
    await lockUser(tx, initial.userId);
    const claimed = await tx.passwordResetToken.updateMany({
      where: { tokenHash, usedAt: null, expires: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (!claimed.count) return false;
    await tx.user.update({
      where: { id: initial.userId },
      data: { passwordHash, authVersion: { increment: 1 } },
    });
    await tx.passwordResetToken.updateMany({
      where: { userId: initial.userId, usedAt: null },
      data: { usedAt: new Date() },
    });
    await invalidateAccess(tx, initial.userId);
    await audit(tx, initial.userId, "RESET_PASSWORD");
    return true;
  });
}
export async function revokeSession(token: string) {
  await prisma.$transaction(async (tx) => {
    const session = await tx.session.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!session) return;
    // Match bulk revocation: lock the owner before session writes and audit FKs.
    const owner = await lockUser(tx, session.userId);
    const changed = await tx.session.updateMany({
      where: {
        id: session.id,
        revokedAt: null,
        expires: { gt: new Date() },
        authVersion: owner.authVersion,
      },
      data: { revokedAt: new Date() },
    });
    if (changed.count) await audit(tx, session.userId, "LOGOUT");
  });
}
export async function revokeAllSessions(
  userId: string,
  access?: ActiveSession,
) {
  return prisma.$transaction(async (tx) => {
    const owner = access
      ? await lockActiveSession(tx, access)
      : await lockUser(tx, userId);
    if (!owner || owner.id !== userId) return false;
    await tx.user.update({
      where: { id: userId },
      data: { authVersion: { increment: 1 } },
    });
    await invalidateAccess(tx, userId);
    await audit(tx, userId, "REVOKE_ALL_SESSIONS");
    return true;
  });
}
export function roleAtLeast(role: Role, allowed: Role[]) {
  return allowed.includes(role);
}
