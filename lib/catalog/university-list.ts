import type { CatalogSnapshot } from "./types";
import type { UniversityCatalogEntry } from "../university-catalog-filters";
import { directoryEvidenceSummary } from "../university-directory-details";

export function universityCatalogEntries(
  catalog: Pick<
    CatalogSnapshot,
    "universities" | "programs" | "directoryDetails" | "admissionCampaigns"
  >,
): UniversityCatalogEntry[] {
  const profiles = new Map(
    catalog.directoryDetails.map((profile) => [
      profile.universitySlug,
      profile,
    ]),
  );
  const campaigns = new Map(
    catalog.admissionCampaigns.map((campaign) => [
      campaign.universitySlug,
      campaign.groups.length,
    ]),
  );
  const programCounts = new Map<string, number>();
  for (const program of catalog.programs)
    programCounts.set(
      program.universitySlug,
      (programCounts.get(program.universitySlug) ?? 0) + 1,
    );

  return catalog.universities.map((university) => {
    const profile = profiles.get(university.slug);
    return {
      id: university.id,
      slug: university.slug,
      name: university.name,
      shortName: university.shortName,
      city: university.city,
      address: university.address,
      website: university.website,
      color: university.color,
      logoUrl: university.logoUrl,
      logoBackground: university.logoBackground,
      description: university.description,
      militaryCenter: university.militaryCenter,
      ...(university.directory
        ? {
            directory: {
              kind: university.directory.kind,
              ownership: university.directory.ownership,
              legalName: university.directory.legalName,
              region: university.directory.region,
            },
          }
        : {}),
      campaignCount: campaigns.get(university.slug) ?? 0,
      evidence: directoryEvidenceSummary(profile),
      offeringCount: profile?.offerings.length ?? 0,
      facultyCount: profile?.faculties?.length ?? 0,
      catalogProgramCount: programCounts.get(university.slug) ?? 0,
    };
  });
}
