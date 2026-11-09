import type { DirectoryDetails } from "./university-directory-details";

type UniversityCoverageGap =
  | keyof DirectoryDetails["fields"]
  | "faculties"
  | "educationalListings"
  | "admissionPrograms";

const commonFields = [
  "fullName",
  "shortName",
  "regDate",
  "address",
  "telephone",
  "email",
  "admissionsUrl",
  "admissionsPhone",
  "admissionsEmail",
  "hostelInfo",
  "overview",
] as const;

/** Implemented education listings and admission programs require separate evidence. */
export function universityCoverageGaps(
  profile:
    | Pick<DirectoryDetails, "fields" | "faculties" | "offerings">
    | undefined,
  admissionProgramCount: number,
): UniversityCoverageGap[] {
  const fields = profile?.fields ?? {};
  const missing: UniversityCoverageGap[] = commonFields.filter(
    (field) => !fields[field],
  );
  if (!profile?.faculties?.length) missing.push("faculties");
  if (!profile?.offerings.length) missing.push("educationalListings");
  if (admissionProgramCount === 0) missing.push("admissionPrograms");
  return missing;
}
