import { createHash } from "node:crypto";

export function requestFingerprint(request: Request): string {
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  const address = forwarded ?? request.headers.get("x-real-ip") ?? "unknown";
  const secret = process.env.AUTH_SECRET ?? "development-only";
  return createHash("sha256").update(`${secret}:${address}`).digest("hex");
}

export function hasValidOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
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
