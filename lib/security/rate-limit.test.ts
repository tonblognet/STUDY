import { beforeEach, describe, expect, it, vi } from "vitest";
const query = vi.hoisted(() => vi.fn());
vi.mock("@/db", () => ({ prisma: { $queryRaw: query } }));
import { checkRateLimit } from "./rate-limit";
describe("durable rate limiting", () => {
  beforeEach(() => {
    query.mockReset();
  });
  it("enforces the count returned by the shared store", async () => {
    query.mockResolvedValue([{ count: 3, resetAt: new Date(90000) }]);
    expect(await checkRateLimit("ip", 2, 60000)).toEqual({
      allowed: false,
      remaining: 0,
      resetAt: 90000,
    });
  });
  it("fails closed when storage is unavailable", async () => {
    query.mockRejectedValue(new Error("offline"));
    expect((await checkRateLimit("ip", 2, 60000)).allowed).toBe(false);
  });
  it("does not persist the raw identity", async () => {
    query.mockResolvedValue([{ count: 1, resetAt: new Date() }]);
    await checkRateLimit("user@example.invalid", 2, 60000);
    expect(query.mock.calls[0].slice(1)).not.toContain("user@example.invalid");
  });
});
