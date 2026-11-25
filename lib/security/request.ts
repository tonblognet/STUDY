import { createHash } from "node:crypto";

export function requestFingerprint(request: Request): string {
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  // Only enable behind a proxy that replaces client-supplied forwarding headers.
  const address =
    process.env.TRUST_PROXY === "true"
      ? (forwarded ?? request.headers.get("x-real-ip") ?? "unknown")
      : "unknown";
  const secret = process.env.AUTH_SECRET ?? "development-only";
  return createHash("sha256").update(`${secret}:${address}`).digest("hex");
}

export function hasValidOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    // A reverse proxy's internal request URL need not be the public origin.
    // Do not authorize a client-selected Host or forwarded-host in production.
    const expected = process.env.APP_URL;
    if (!expected && process.env.NODE_ENV === "production") return false;
    const actual = new URL(origin);
    return (
      actual.origin === origin &&
      actual.origin === new URL(expected || request.url).origin
    );
  } catch {
    return false;
  }
}

export function safeReturnPath(value: string | null | undefined): string {
  if (!value?.startsWith("/") || value.startsWith("//")) return "/account";
  try {
    const url = new URL(value, "https://postupai.local");
    return url.origin === "https://postupai.local"
      ? `${url.pathname}${url.search}`
      : "/account";
  } catch {
    return "/account";
  }
}
