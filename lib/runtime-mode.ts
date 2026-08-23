export const IS_GITHUB_PAGES = process.env.NEXT_PUBLIC_DEPLOY_TARGET === "github-pages";

export const FULL_SITE_URL =
  process.env.NEXT_PUBLIC_FULL_SITE_URL ??
  "https://postupai-2026.exman101.chatgpt.site";

export function fullSitePath(path: string): string {
  return new URL(path, `${FULL_SITE_URL.replace(/\/$/, "")}/`).toString();
}
