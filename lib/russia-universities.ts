import directory from "@/data-sources/russia/universities.json";
import type { University } from "./data";

export const russiaUniversities = directory.universities as University[];

/** Keep existing catalog identities when a regional source repeats an institution. */
export function completeRussiaDirectory(
  existing: University[],
  regional: University[] = russiaUniversities,
): University[] {
  const slugs = new Set(existing.map((university) => university.slug));
  const ids = new Set(existing.map((university) => university.id));
  const monitoringIds = new Set(
    existing.flatMap((university) =>
      university.directory?.monitoringId
        ? [university.directory.monitoringId]
        : [],
    ),
  );
  const additions = regional.filter((university) => {
    const monitoringId = university.directory?.monitoringId;
    if (
      slugs.has(university.slug) ||
      ids.has(university.id) ||
      (monitoringId && monitoringIds.has(monitoringId))
    )
      return false;
    slugs.add(university.slug);
    ids.add(university.id);
    if (monitoringId) monitoringIds.add(monitoringId);
    return true;
  });
  return [...existing, ...additions];
}
