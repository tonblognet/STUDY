import { cookies } from "next/headers";
import type { Role } from "@prisma/client";
import { hashToken } from "@/lib/auth/crypto";
import { readActiveSession } from "@/lib/auth/session-access";

export const SESSION_COOKIE =
  process.env.SESSION_COOKIE_NAME ?? "postupai_session";

export async function getActiveSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    return await readActiveSession({ tokenHash: hashToken(token) });
  } catch {
    return null;
  }
}

export async function getSessionUser() {
  return (await getActiveSession())?.user ?? null;
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
