/**
 * Directory model: types and pure helpers for university directory details.
 * Kept free of data imports so runtime pages never bundle the repository
 * evidence files; the repository loader lives in university-directory-details.
 */
import type { HseAdmissionResources } from "@/lib/hse-admission-resources";
import type { SourcedValue } from "@/lib/admissions/types";

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
  programUrl?: string;
  campus?: string;
  admissionDetails?: {
    priorEducation?: SourcedValue<string>;
    schoolBase?: 9 | 11;
    annualTuition?: SourcedValue<number>;
    budgetPlaces?: SourcedValue<number>;
    paidPlaces?: SourcedValue<number>;
    exams?: SourcedValue<string>;
    note?: string;
  };
  /** Exact published amount and billing period; not an inferred annual tuition. */
  publishedPrice?: {
    amount: number;
    currency: string;
    period: string | null;
  };
};

export type DirectoryDetails = {
  universitySlug: string;
  admissionResources?: HseAdmissionResources;
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
  /**
   * Listings stored outside the catalog payload as an immutable,
   * content-addressed set (ADR 0006). When present, `offerings` is empty.
   */
  offeringSet?: OfferingSetRef;
};

export type OfferingSetRef = { digest: string; count: number };

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

export function normalizeDirectoryText(value: string | null): string {
  return (value ?? "")
    .trim()
    .toLocaleLowerCase("ru")
    .replaceAll("ё", "е")
    .replace(/\s+/g, " ");
}

/** Different fetch batches may assign different IDs to the same published row. */
export function offeringIdentity(row: UniversityOffering): string {
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
      row.campus ?? null,
      row.publishedPrice?.currency ?? null,
      row.publishedPrice?.period ?? null,
    ]
      .map(normalizeDirectoryText)
      .concat(
        String(row.sourceYear),
        row.sourceUrl,
        String(row.publishedPrice?.amount ?? ""),
      ),
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
