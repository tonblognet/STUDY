import type {
  DirectoryDetails,
  UniversityOffering,
} from "@/lib/directory/model";
import { catalogChecksum } from "./diff";
import type { CatalogSnapshot } from "./types";

/**
 * Directory listings live outside the catalog payload (ADR 0006): each
 * university's listings form an immutable set addressed by the checksum of its
 * content. A publication references exact sets, so versioning, rollback and
 * the payload checksum keep covering the listings without carrying them.
 */
export type OfferingSet = {
  digest: string;
  universitySlug: string;
  offerings: UniversityOffering[];
};

export type TrackListing = {
  universitySlug: string;
  offering: UniversityOffering;
};

export function offeringSetDigest(offerings: UniversityOffering[]): string {
  return catalogChecksum(offerings);
}

/** A university with its own admission resources keeps listings inline (HSE). */
export function keepsInlineOfferings(details: DirectoryDetails): boolean {
  return Boolean(details.admissionResources);
}

export function offeringCount(details?: DirectoryDetails): number {
  if (!details) return 0;
  return details.offeringSet?.count ?? details.offerings.length;
}

export function catalogOfferingCount(snapshot: CatalogSnapshot): number {
  return snapshot.directoryDetails.reduce(
    (sum, details) => sum + offeringCount(details),
    0,
  );
}

/** Replace inline listings by set references; already external rows pass through. */
export function externalizeOfferings(snapshot: CatalogSnapshot): {
  snapshot: CatalogSnapshot;
  sets: OfferingSet[];
} {
  const sets: OfferingSet[] = [];
  const directoryDetails = snapshot.directoryDetails.map((details) => {
    if (
      details.offeringSet ||
      keepsInlineOfferings(details) ||
      details.offerings.length === 0
    )
      return details;
    const digest = offeringSetDigest(details.offerings);
    sets.push({
      digest,
      universitySlug: details.universitySlug,
      offerings: details.offerings,
    });
    return {
      ...details,
      offerings: [],
      offeringSet: { digest, count: details.offerings.length },
    };
  });
  return { snapshot: { ...snapshot, directoryDetails }, sets };
}

/** Fail closed when stored rows do not reproduce the referenced set. */
export function assertOfferingSet(
  ref: { digest: string; count: number },
  offerings: UniversityOffering[],
): UniversityOffering[] {
  if (
    offerings.length !== ref.count ||
    offeringSetDigest(offerings) !== ref.digest
  )
    throw new Error(`Перечень не совпадает с публикацией: ${ref.digest}`);
  return offerings;
}
