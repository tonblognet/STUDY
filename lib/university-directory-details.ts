import snapshot from "@/data-sources/moscow/profiles.json";
import regionalSnapshot from "@/data-sources/russia/profiles.json";
import enrichment from "@/data-sources/russia/moscow-enrichment-2026-10-09.json";
import regionalEnrichment from "@/data-sources/russia/regional-enrichment-2026-10-09.json";
import regionalEnrichmentOctober10 from "@/data-sources/russia/regional-enrichment-2026-10-10.json";
import moscowEnrichmentOctober10 from "@/data-sources/russia/moscow-enrichment-2026-10-10.json";
import moscowEnrichmentOctober11 from "@/data-sources/russia/moscow-enrichment-2026-10-11.json";
import regionalEnrichmentOctober11 from "@/data-sources/russia/regional-enrichment-2026-10-11.json";
import moscowEnrichmentOctober20 from "@/data-sources/russia/moscow-enrichment-2026-10-20.json";
import regionalNorthEnrichmentOctober20 from "@/data-sources/russia/regional-north-enrichment-2026-10-20.json";
import regionalSouthEnrichmentOctober20 from "@/data-sources/russia/regional-south-enrichment-2026-10-20.json";
import moscowEnrichmentOctober22 from "@/data-sources/russia/moscow-enrichment-2026-10-22.json";
import regionalEnrichmentOctober22 from "@/data-sources/russia/regional-enrichment-2026-10-22.json";
import contactsEnrichmentOctober22 from "@/data-sources/russia/contacts-enrichment-2026-10-22.json";
import regionalEducationOctober25 from "@/data-sources/russia/regional-education-enrichment-2026-10-25.json";
import regionalStructureOctober25 from "@/data-sources/russia/regional-structure-enrichment-2026-10-25.json";
import contactsEnrichmentOctober25 from "@/data-sources/russia/contacts-enrichment-2026-10-25.json";
import coreEnrichmentNovember9 from "@/data-sources/russia/core-enrichment-2026-11-09.json";
import moscowEnrichmentNovember9 from "@/data-sources/russia/moscow-priority-enrichment-2026-11-09.json";
import southEastEnrichmentNovember9 from "@/data-sources/russia/south-east-enrichment-2026-11-09.json";
import uralNsuEnrichmentNovember9 from "@/data-sources/russia/ural-nsu-enrichment-2026-11-09.json";
import continuationEducationNovember9 from "@/data-sources/russia/continuation-education-2026-11-09.json";
import continuationContactsNovember9 from "@/data-sources/russia/continuation-contacts-2026-11-09.json";
import continuationStructureNovember9 from "@/data-sources/russia/continuation-structure-2026-11-09.json";
import followupRegionalEducationNovember9 from "@/data-sources/russia/followup-regional-education-2026-11-09.json";
import followupCentralEducationNovember9 from "@/data-sources/russia/followup-central-education-2026-11-09.json";
import followupContactsNovember9 from "@/data-sources/russia/followup-contacts-2026-11-09.json";
import moscowOverviewNovember10 from "@/data-sources/russia/moscow-overview-enrichment-2026-11-10.json";
import moscowHseNovember10 from "@/data-sources/russia/moscow-hse-enrichment-2026-11-10.json";
import moscowMiptNovember10 from "@/data-sources/russia/moscow-mipt-enrichment-2026-11-10.json";
import moscowMisisNovember10 from "@/data-sources/russia/moscow-misis-enrichment-2026-11-10.json";

export type DirectoryField = {
  value: string;
  sourceUrl: string;
  /** For general overviews this is the calendar year of the source snapshot. */
  sourceYear: number;
  checkedAt: string;
  sourceSha256: string;
};

export type UniversityOffering = {
  id: string;
  code: string;
  title: string;
  profile: string | null;
  level: string;
  forms: string | null;
  duration: string | null;
  admissionsStatus: string;
  sourceUrl: string;
  sourceYear: number | null;
  checkedAt: string;
  sourceSha256: string;
  sourceSection?: string;
};

export type DirectoryDetails = {
  universitySlug: string;
  faculties?: DirectoryFaculty[];
  educationAreas: Array<{
    code: string;
    title: string;
    sourceUrl: string;
    sourceYear: number;
    checkedAt: string;
  }>;
  fields: Partial<
    Record<
      | "fullName"
      | "shortName"
      | "regDate"
      | "address"
      | "telephone"
      | "email"
      | "hostelInfo"
      | "admissionsUrl"
      | "admissionsPhone"
      | "admissionsEmail"
      | "overview",
      DirectoryField
    >
  >;
  licenseRegistry: { value: string; checkedAt: string; note: string };
  licenseExtract: {
    number: string;
    statusAsPublished: string;
    asOf: string;
    sourceUrl: string;
    checkedAt: string;
    sourceKind: string;
    sourceSha256?: string;
  } | null;
  documents: Array<{
    label: string;
    kind: string;
    url: string;
    pageUrl: string;
  }>;
  offerings: UniversityOffering[];
};

export type DirectoryFaculty = {
  name: string;
  url: string | null;
  sourceUrl: string;
  sourceYear: number;
  checkedAt: string;
  sourceSha256: string;
  sourceSection?: string;
};

export type DirectoryEnrichment = {
  universitySlug: string;
  fields?: DirectoryDetails["fields"];
  faculties?: DirectoryFaculty[];
  offerings?: UniversityOffering[];
};

function normalizeDirectoryText(value: string | null): string {
  return (value ?? "")
    .trim()
    .toLocaleLowerCase("ru")
    .replaceAll("ё", "е")
    .replace(/\s+/g, " ");
}

/** Different fetch batches may assign different IDs to the same published row. */
function offeringIdentity(row: UniversityOffering): string {
  return JSON.stringify(
    [
      row.code,
      row.title,
      row.profile,
      row.level,
      row.forms,
      row.duration,
      row.admissionsStatus,
      row.sourceSection ?? null,
    ]
      .map(normalizeDirectoryText)
      .concat(String(row.sourceYear), row.sourceUrl),
  );
}

/** Enrichment fills gaps; previously reviewed field values retain their provenance. */
export function mergeDirectoryEnrichment(
  profiles: DirectoryDetails[],
  additions: DirectoryEnrichment[],
): DirectoryDetails[] {
  const knownSlugs = new Set(profiles.map((profile) => profile.universitySlug));
  for (const addition of additions)
    if (!knownSlugs.has(addition.universitySlug))
      throw new Error(
        `Нет профиля вуза для обогащения: ${addition.universitySlug}`,
      );
  return profiles.map((profile) => {
    const updates = additions.filter(
      (addition) => addition.universitySlug === profile.universitySlug,
    );
    if (!updates.length) return profile;
    const fields = { ...profile.fields };
    const faculties = new Map(
      (profile.faculties ?? []).map((faculty) => [
        normalizeDirectoryText(faculty.name),
        faculty,
      ]),
    );
    const offerings = new Map(profile.offerings.map((row) => [row.id, row]));
    const offeringKeys = new Set(profile.offerings.map(offeringIdentity));
    for (const update of updates) {
      for (const [key, field] of Object.entries(update.fields ?? {})) {
        const fieldKey = key as keyof DirectoryDetails["fields"];
        if (!fields[fieldKey]) fields[fieldKey] = field;
      }
      for (const faculty of update.faculties ?? []) {
        const key = normalizeDirectoryText(faculty.name);
        if (!faculties.has(key)) faculties.set(key, faculty);
      }
      for (const offering of update.offerings ?? []) {
        const key = offeringIdentity(offering);
        if (!offerings.has(offering.id) && !offeringKeys.has(key)) {
          offerings.set(offering.id, offering);
          offeringKeys.add(key);
        }
      }
    }
    return {
      ...profile,
      fields,
      ...(faculties.size > 0 ? { faculties: [...faculties.values()] } : {}),
      offerings: [...offerings.values()],
    };
  });
}

export const directoryDetails = mergeDirectoryEnrichment(
  [...snapshot.profiles, ...regionalSnapshot.profiles] as DirectoryDetails[],
  [
    ...enrichment.profiles,
    ...regionalEnrichment.profiles,
    ...regionalEnrichmentOctober10.profiles,
    ...moscowEnrichmentOctober10.profiles,
    ...moscowEnrichmentOctober11.profiles,
    ...regionalEnrichmentOctober11.profiles,
    ...moscowEnrichmentOctober20.profiles,
    ...regionalNorthEnrichmentOctober20.profiles,
    ...regionalSouthEnrichmentOctober20.profiles,
    ...moscowEnrichmentOctober22.profiles,
    ...regionalEnrichmentOctober22.profiles,
    ...contactsEnrichmentOctober22.profiles,
    ...regionalEducationOctober25.profiles,
    ...regionalStructureOctober25.profiles,
    ...contactsEnrichmentOctober25.profiles,
    ...coreEnrichmentNovember9.profiles,
    ...moscowEnrichmentNovember9.profiles,
    ...southEastEnrichmentNovember9.profiles,
    ...uralNsuEnrichmentNovember9.profiles,
    ...continuationEducationNovember9.profiles,
    ...continuationContactsNovember9.profiles,
    ...continuationStructureNovember9.profiles,
    ...followupRegionalEducationNovember9.profiles,
    ...followupCentralEducationNovember9.profiles,
    ...followupContactsNovember9.profiles,
    ...moscowOverviewNovember10.profiles,
    ...moscowHseNovember10.profiles,
    ...moscowMiptNovember10.profiles,
    ...moscowMisisNovember10.profiles,
  ] as DirectoryEnrichment[],
);
const bySlug = new Map(
  directoryDetails.map((profile) => [profile.universitySlug, profile]),
);

export function getDirectoryDetails(
  slug: string,
): DirectoryDetails | undefined {
  return bySlug.get(slug);
}

export const directoryOfferingCount = directoryDetails.reduce(
  (total, profile) => total + profile.offerings.length,
  0,
);

export function formatDirectoryDate(value: string): string {
  return new Date(value).toLocaleDateString("ru-RU", {
    timeZone: "Europe/Moscow",
  });
}

/** Describes the collected profile fields, not admission eligibility or licensing. */
export function directoryEvidenceSummary(details?: DirectoryDetails): {
  fieldCount: number;
  hasContacts: boolean;
  checkedAt: string | null;
  licenseAsOf: string | null;
} {
  const fields = Object.values(details?.fields ?? {});
  const checkedDates = fields
    .map((field) => field.checkedAt)
    .filter((date) => Number.isFinite(Date.parse(date)))
    .sort((a, b) => Date.parse(b) - Date.parse(a));
  return {
    fieldCount: fields.length,
    hasContacts: Boolean(details?.fields.telephone || details?.fields.email),
    checkedAt: checkedDates[0] ?? null,
    licenseAsOf: details?.licenseExtract?.asOf ?? null,
  };
}
