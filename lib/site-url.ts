import { headers } from "next/headers";

export async function getSiteBaseUrl(): Promise<URL> {
  const requestHeaders = await headers();
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured && !configured.includes("localhost")) return new URL(configured);
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  return new URL(host ? `${protocol}://${host}` : configured ?? "http://localhost:3000");
}
