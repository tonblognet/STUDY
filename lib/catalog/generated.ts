import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { GENERATED_CATALOG_DIR } from "./directory-sources";
import type { TrackListing } from "./offering-sets";
import type { CatalogSnapshot } from "./types";
import type { UniversityOffering } from "@/lib/directory/model";

/**
 * Generated repository catalog (ADR 0006), written by `pnpm catalog:generate`:
 * a light snapshot without external listings, one file per listing set and one
 * listing index per education track. Runtime code reads these files lazily and
 * never bundles the repository evidence.
 */
const cache = new Map<string, { mtimeMs: number; value: unknown }>();

function readGenerated<T>(...parts: string[]): T {
  const file = path.join(GENERATED_CATALOG_DIR, ...parts);
  let mtimeMs: number;
  try {
    mtimeMs = statSync(file).mtimeMs;
  } catch (error) {
    throw new Error(
      `Нет сгенерированного каталога (${file}). Выполните pnpm catalog:generate`,
      { cause: error },
    );
  }
  const cached = cache.get(file);
  if (cached?.mtimeMs === mtimeMs) return cached.value as T;
  const value = JSON.parse(readFileSync(file, "utf8")) as T;
  cache.set(file, { mtimeMs, value });
  return value;
}

/** Repository evidence prepared for preview; never an implicit DB fallback. */
export function generatedCatalog(): CatalogSnapshot {
  return readGenerated<CatalogSnapshot>("catalog.json");
}

export function generatedOfferingSet(digest: string): UniversityOffering[] {
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error("Некорректный набор");
  return readGenerated<UniversityOffering[]>("offerings", `${digest}.json`);
}

export function generatedTrackListings(track: string): TrackListing[] {
  if (!/^[a-z]+$/.test(track)) throw new Error("Некорректный уровень");
  return readGenerated<TrackListing[]>("tracks", `${track}.json`);
}
