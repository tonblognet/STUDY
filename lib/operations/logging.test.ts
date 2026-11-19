import { describe, expect, it } from "vitest";
import { serverFailureEvent } from "./logging";

describe("safe server failure events", () => {
  it("omits error messages, stack, names and private dynamic paths", () => {
    const error = new TypeError("password=private-password");
    error.name = "private-token";
    const event = serverFailureEvent(
      error,
      {
        routePath: "/api/account/private-user?token=private-token",
        routerKind: "App Router",
        routeType: "route",
      },
      new Date("2026-11-10T00:00:00Z"),
    );
    expect(event).toEqual({
      event: "SERVER_REQUEST_FAILURE",
      at: "2026-11-10T00:00:00.000Z",
      routeGroup: "/api/account/*",
      router: "app",
      operation: "route",
      errorType: "TypeError",
    });
    expect(JSON.stringify(event)).not.toMatch(/private|password|stack/);
  });
  it("does not inspect arbitrary thrown objects or serialize a toJSON hook", () => {
    const error = {
      get message(): never {
        throw new Error("must not read");
      },
      toJSON(): never {
        throw new Error("must not serialize");
      },
    };
    const event = serverFailureEvent(error, {
      routePath: "/reset-password?token=secret",
      routeType: "secret",
      routerKind: "secret",
    });
    expect(event).toMatchObject({
      routeGroup: "public_page",
      operation: "unknown",
      router: "unknown",
      errorType: "Unknown",
    });
  });
});
