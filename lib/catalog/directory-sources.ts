import { readFileSync } from "node:fs";
import path from "node:path";
import type { DirectoryDetails } from "@/lib/directory/model";

/**
 * Reviewed directory sources per university (ADR 0006): the hostnames of the
 * card fields (trusted for adapter domains) and every exact URL already
 * reviewed in repository directory evidence. A light summary is enough for
 * validation, so runtime code never imports the repository evidence files.
 */
export type DirectorySources = {
  fieldDomains: Record<string, string[]>;
  knownUrls: Record<string, string[]>;
};

/** `pnpm catalog:generate` output; the standalone server ships it next to server.js. */
export const GENERATED_CATALOG_DIR =
  process.env.CATALOG_GENERATED_DIR ??
  path.join(process.cwd(), "generated", "catalog");

let registered: DirectorySources | null = null;
let indexed: {
  fieldDomains: Map<string, string[]>;
  knownUrls: Map<string, Set<string>>;
} | null = null;

/** Scripts and tests register the summary computed from the repository. */
export function registerDirectorySources(sources: DirectorySources) {
  registered = sources;
  indexed = null;
}

function loadSources(): DirectorySources {
  if (registered) return registered;
  const file = path.join(GENERATED_CATALOG_DIR, "directory-sources.json");
  try {
    registered = JSON.parse(readFileSync(file, "utf8")) as DirectorySources;
  } catch (error) {
    throw new Error(
      `Нет сводки источников каталога (${file}). Выполните pnpm catalog:generate`,
      { cause: error },
    );
  }
  return registered;
}

function sourceIndex() {
  if (indexed) return indexed;
  const sources = loadSources();
  indexed = {
    fieldDomains: new Map(Object.entries(sources.fieldDomains)),
    knownUrls: new Map(
      Object.entries(sources.knownUrls).map(([slug, urls]) => [
        slug,
        new Set(urls),
      ]),
    ),
  };
  return indexed;
}

export function reviewedFieldDomains(slug: string): string[] {
  return sourceIndex().fieldDomains.get(slug) ?? [];
}

export function isReviewedDirectoryUrl(slug: string, url: string): boolean {
  return sourceIndex().knownUrls.get(slug)?.has(url) ?? false;
}

// Preserve exact, previously reviewed directory evidence (including official
// registry documents and university redirects); it is not an arbitrary host allowlist.
function knownDirectoryUrls(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) =>
    ["sourceUrl", "url", "pageUrl", "programUrl"].includes(key) &&
    typeof child === "string"
      ? [child]
      : knownDirectoryUrls(child),
  );
}

export function summarizeDirectorySources(
  details: DirectoryDetails[],
): DirectorySources {
  const fieldDomains: Record<string, string[]> = {};
  const knownUrls: Record<string, string[]> = {};
  for (const row of details) {
    fieldDomains[row.universitySlug] = [
      ...new Set(
        Object.values(row.fields).map(
          (field) => new URL(field!.sourceUrl).hostname,
        ),
      ),
    ].sort();
    knownUrls[row.universitySlug] = [
      ...new Set(knownDirectoryUrls(row)),
    ].sort();
  }
  return { fieldDomains, knownUrls };
}
