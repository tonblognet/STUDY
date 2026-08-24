import { beforeEach, describe, expect, it } from "vitest";
import {
  checkRateLimit,
  clearRateLimitsForTests,
} from "@/lib/security/rate-limit";

describe("rate limiting", () => {
  beforeEach(clearRateLimitsForTests);
  it("blocks requests above the configured limit", () => {
    expect(checkRateLimit("ip", 2, 60_000).allowed).toBe(true);
    expect(checkRateLimit("ip", 2, 60_000).allowed).toBe(true);
    expect(checkRateLimit("ip", 2, 60_000).allowed).toBe(false);
  });
  it("keeps identities isolated", () => {
    checkRateLimit("a", 1, 60_000);
    expect(checkRateLimit("b", 1, 60_000).allowed).toBe(true);
  });
});
