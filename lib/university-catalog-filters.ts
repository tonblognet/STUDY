import type { z } from "zod";
import type { University } from "./data";
import type { universityViewSchema } from "./catalog/view-state";
import type { directoryEvidenceSummary } from "./university-directory-details";

/** Only the values rendered or searched by the university list cross the client boundary. */
export type UniversityCatalogEntry = Pick<
  University,
  | "id"
  | "slug"
  | "name"
  | "city"
  | "address"
  | "website"
  | "color"
  | "logoUrl"
  | "logoBackground"
  | "description"
  | "militaryCenter"
> & {
  // A name equal to `name` is omitted from the list payload.
  shortName?: string;
  directory?: Pick<
    NonNullable<University["directory"]>,
    "kind" | "ownership" | "region"
  > & { legalName?: string };
  catalogProgramCount: number;
  offeringCount: number;
  facultyCount: number;
  campaignCount: number;
  evidence: ReturnType<typeof directoryEvidenceSummary>;
};

export function filterUniversities(
  entries: UniversityCatalogEntry[],
  view: z.infer<typeof universityViewSchema>,
): UniversityCatalogEntry[] {
  const normalize = (value: string) =>
    value.trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
  const query = normalize(view.query);
  return entries.filter(
    (u) =>
      normalize(
        `${u.name} ${u.shortName ?? u.name} ${u.directory ? (u.directory.legalName ?? u.name) : ""} ${u.city} ${u.address} ${u.directory?.region ?? ""}`,
      ).includes(query) &&
      (view.city === "all" || u.city === view.city) &&
      (view.ownership === "all" || u.directory?.ownership === view.ownership) &&
      (view.detailsFilter === "all" ||
        (view.detailsFilter === "contacts" && u.evidence.hasContacts) ||
        (view.detailsFilter === "offerings" && u.offeringCount > 0) ||
        (view.detailsFilter === "faculties" && u.facultyCount > 0) ||
        (view.detailsFilter === "extract" && u.evidence.licenseAsOf !== null)),
  );
}
