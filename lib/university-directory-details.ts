import snapshot from "@/data-sources/moscow/profiles.json";

export type DirectoryField = {
  value: string;
  sourceUrl: string;
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
};

export type DirectoryDetails = {
  universitySlug: string;
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
      | "admissionsUrl",
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

export const directoryDetails = snapshot.profiles as DirectoryDetails[];
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
export function directoryEvidenceSummary(details?: DirectoryDetails) {
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
