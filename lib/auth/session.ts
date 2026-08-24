import { cookies } from "next/headers";
import type { Role } from "@prisma/client";
import { prisma } from "@/db";
import { hashToken } from "@/lib/auth/crypto";

export const SESSION_COOKIE =
  process.env.SESSION_COOKIE_NAME ?? "postupai_session";

export async function getSessionUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const session = await prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (!session || session.revokedAt || session.expires <= new Date())
      return null;
    return session.user;
  } catch {
    return null;
  }
}

export async function requireRole(roles: Role[]) {
  const user = await getSessionUser();
  if (!user || !roles.includes(user.role)) return null;
  return user;
}

export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}
