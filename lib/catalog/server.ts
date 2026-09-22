import { cache } from "react";
import { connection } from "next/server";
import { prisma } from "@/db";
import { readPublishedCatalog } from "./service";
import { CatalogError } from "./types";

export function catalogStorage(): "snapshot" | "database" {
  const mode =
    process.env.CATALOG_STORAGE ??
    (process.env.DATABASE_URL ? "database" : "snapshot");
  if (mode !== "snapshot" && mode !== "database")
    throw new CatalogError("Некорректный CATALOG_STORAGE", 503);
  return mode;
}

/** Request memoization only: publishing is visible on the next request on every replica. */
export const getCatalogPublication = cache(async () => {
  await connection();
  if (catalogStorage() === "snapshot") {
    const { baselineCatalog } = await import("./baseline");
    return { revisionId: null, publishedAt: null, snapshot: baselineCatalog() };
  }
  return readPublishedCatalog(prisma);
});

export async function getCatalog() {
  return (await getCatalogPublication()).snapshot;
}
