import { prisma } from "@/db";
import type {
  DirectoryDetails,
  UniversityOffering,
} from "@/lib/directory/model";
import type { AdvancedEducationTrack } from "@/lib/education-pathways";
import { generatedOfferingSet, generatedTrackListings } from "./generated";
import { assertOfferingSet, type TrackListing } from "./offering-sets";
import { catalogStorage } from "./server";
import { CatalogError, type CatalogSnapshot } from "./types";

/**
 * Listings of the selected publication (ADR 0006). Inline listings (HSE and
 * older revisions) are returned as stored; external sets are read from the
 * generated files or the CatalogOffering table and verified against the
 * digest and count the publication references.
 */
const SET_CACHE_LIMIT = 256;
const setCache = new Map<string, UniversityOffering[]>();
const trackCache = new Map<string, TrackListing[]>();

function remember<T>(
  cache: Map<string, T>,
  key: string,
  value: T,
  limit: number,
) {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > limit) cache.delete(cache.keys().next().value!);
  return value;
}

async function readSet(ref: { digest: string; count: number }) {
  const cached = setCache.get(ref.digest);
  if (cached) return cached;
  let offerings: UniversityOffering[];
  if (catalogStorage() === "snapshot") {
    offerings = generatedOfferingSet(ref.digest);
  } else {
    const rows = await prisma.catalogOffering.findMany({
      where: { setDigest: ref.digest },
      orderBy: { position: "asc" },
      select: { data: true },
    });
    offerings = rows.map((row) => row.data as UniversityOffering);
  }
  try {
    assertOfferingSet(ref, offerings);
  } catch {
    throw new CatalogError("Нарушена целостность перечня вуза", 503);
  }
  return remember(setCache, ref.digest, offerings, SET_CACHE_LIMIT);
}

export async function directoryOfferings(
  details?: DirectoryDetails,
): Promise<UniversityOffering[]> {
  if (!details) return [];
  return details.offeringSet ? readSet(details.offeringSet) : details.offerings;
}

export async function universityOfferings(
  catalog: CatalogSnapshot,
  slug: string,
): Promise<UniversityOffering[]> {
  return directoryOfferings(
    catalog.directoryDetails.find((row) => row.universitySlug === slug),
  );
}

/** External listings of one education track; inline rows are added by the caller. */
export async function trackListings(
  catalog: CatalogSnapshot,
  track: AdvancedEducationTrack,
): Promise<TrackListing[]> {
  const external = catalog.directoryDetails.filter((row) => row.offeringSet);
  if (!external.length) return [];
  if (catalogStorage() === "snapshot") {
    const listed = new Map(
      external.map((row) => [row.universitySlug, row.offeringSet!.digest]),
    );
    // The track index belongs to the generated repository catalog; it is used
    // only when every referenced set matches the current publication.
    return generatedTrackListings(track).filter((row) =>
      listed.has(row.universitySlug),
    );
  }
  const digests = external.map((row) => row.offeringSet!.digest).sort();
  const key = `${track}:${digests.join(",")}`;
  const cached = trackCache.get(key);
  if (cached) return cached;
  const slugByDigest = new Map(
    external.map((row) => [row.offeringSet!.digest, row.universitySlug]),
  );
  const rows = await prisma.catalogOffering.findMany({
    where: { setDigest: { in: digests }, track },
    orderBy: [{ setDigest: "asc" }, { position: "asc" }],
    select: { setDigest: true, data: true },
  });
  return remember(
    trackCache,
    key,
    rows.map((row) => ({
      universitySlug: slugByDigest.get(row.setDigest)!,
      offering: row.data as UniversityOffering,
    })),
    8,
  );
}
