import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn<() => Promise<{ id: string } | null>>(),
  cookieGet: vi.fn(),
  revokeSession: vi.fn(),
  revokeAllSessions: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({
  getSessionUser: mocks.getSessionUser,
  getActiveSession: async () => {
    const user = await mocks.getSessionUser();
    return user ? { id: "session-row-b", user } : null;
  },
  SESSION_COOKIE: "postupai_session",
}));
vi.mock("@/lib/auth/service", () => ({
  revokeSession: mocks.revokeSession,
  revokeAllSessions: mocks.revokeAllSessions,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.cookieGet }),
}));

import { POST as logout } from "@/app/api/auth/logout/route";
import { POST as logoutAll } from "@/app/api/auth/logout-all/route";

const base = "https://postupai.example";
function request(path: string, accountId?: string, origin = base) {
  return new Request(`${base}${path}`, {
    method: "POST",
    headers: {
      origin,
      ...(accountId === undefined ? {} : { "x-account-id": accountId }),
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionUser.mockResolvedValue({ id: "account-b" });
  mocks.cookieGet.mockReturnValue({ value: "session-b" });
  mocks.revokeAllSessions.mockResolvedValue(true);
});

for (const [path, handler] of [
  ["/api/auth/logout", logout],
  ["/api/auth/logout-all", logoutAll],
] as const) {
  describe(path, () => {
    it.each(["account-a", undefined])(
      "rejects a stale or absent tab identity (%s) without changing the session",
      async (identity) => {
        const response = await handler(request(path, identity));
        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({
          error: "Аккаунт в другой вкладке изменился. Перезагрузите страницу",
        });
        expect(response.headers.get("set-cookie")).toBeNull();
        expect(mocks.revokeSession).not.toHaveBeenCalled();
        expect(mocks.revokeAllSessions).not.toHaveBeenCalled();
      },
    );

    it("rejects a foreign origin before accessing the session", async () => {
      const response = await handler(
        request(path, "account-b", "https://other.example"),
      );
      expect(response.status).toBe(403);
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(mocks.getSessionUser).not.toHaveBeenCalled();
      expect(mocks.cookieGet).not.toHaveBeenCalled();
      expect(mocks.revokeSession).not.toHaveBeenCalled();
      expect(mocks.revokeAllSessions).not.toHaveBeenCalled();
    });

    it("allows the matching account and clears the cookie", async () => {
      const response = await handler(request(path, "account-b"));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
      expect(response.headers.get("set-cookie")).toMatch(
        /postupai_session=;.*Max-Age=0/,
      );
      if (path === "/api/auth/logout") {
        expect(mocks.revokeSession).toHaveBeenCalledExactlyOnceWith(
          "session-b",
        );
        expect(mocks.revokeAllSessions).not.toHaveBeenCalled();
      } else {
        expect(mocks.revokeAllSessions).toHaveBeenCalledExactlyOnceWith(
          "account-b",
          { id: "session-row-b", user: { id: "account-b" } },
        );
        expect(mocks.revokeSession).not.toHaveBeenCalled();
      }
    });
  });
}

it("keeps single-session logout idempotent after the session expires", async () => {
  mocks.getSessionUser.mockResolvedValue(null);
  const response = await logout(request("/api/auth/logout", "old-account"));
  expect(response.status).toBe(200);
  expect(mocks.revokeSession).not.toHaveBeenCalled();
  expect(response.headers.get("set-cookie")).toMatch(/Max-Age=0/);
});

it("requires an active session before revoking all sessions", async () => {
  mocks.getSessionUser.mockResolvedValue(null);
  const response = await logoutAll(
    request("/api/auth/logout-all", "account-b"),
  );
  expect(response.status).toBe(401);
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(mocks.revokeAllSessions).not.toHaveBeenCalled();
});

it("does not clear cookies when bulk logout loses access while waiting", async () => {
  mocks.revokeAllSessions.mockResolvedValue(false);
  const response = await logoutAll(
    request("/api/auth/logout-all", "account-b"),
  );
  expect(response.status).toBe(401);
  expect(response.headers.get("set-cookie")).toBeNull();
});
