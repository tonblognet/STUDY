import type { CatalogSnapshot } from "@/lib/catalog/types";
import {
  hseExplorerData,
  hseExplorerRows,
  hseHasKnownConditions,
  type HseExplorerRow,
} from "@/lib/hse-explorer-data";

export const educationTracks = [
  { key: "undergraduate", label: "Бакалавриат и специалитет" },
  { key: "master", label: "Магистратура" },
  { key: "aspirantura", label: "Аспирантура" },
  { key: "doctorate", label: "Докторантура" },
  { key: "college", label: "Колледжи · СПО" },
] as const;
export type EducationTrack = (typeof educationTracks)[number]["key"];
export type AdvancedEducationTrack = Exclude<EducationTrack, "undergraduate">;

export function educationTrack(raw: unknown): EducationTrack {
  return educationTracks.some((track) => track.key === raw)
    ? (raw as EducationTrack)
    : "undergraduate";
}

/** Professional-development Master/MBA/Doctor titles are not academic degrees. */
export function offeringTrack(level: string): AdvancedEducationTrack | null {
  const value = level
    .toLocaleLowerCase("ru")
    .replaceAll("ё", "е")
    .replace(/\s+/g, " ")
    .trim();
  if (
    /дополнительн|переподготов|повышени[ея]\s+квалификац|mba|executive|specialized|doctor in\/of/.test(
      value,
    )
  )
    return null;

  // A statutory level can combine specialist and master's degrees. Only an
  // explicitly named qualification resolves that combined label for this row.
  const masterQualification = /(^|[^а-я])магистр(?=$|[^а-я])/.test(value);
  const otherQualification =
    /(^|[^а-я])(?:бакалавр|специалист)(?=$|[^а-я])/.test(value);
  const aspirantura = /аспирантур|подготовк.*научн.*педагогическ.*кадр/.test(
    value,
  );
  const doctorate = /докторантур/.test(value);
  const college =
    /среднее профессиональное|среднего профессионального|среднего звена|^спо$/.test(
      value,
    );
  if (
    masterQualification &&
    !otherQualification &&
    !aspirantura &&
    !doctorate &&
    !college
  )
    return "master";
  if (/бакалавриат|специалитет/.test(value)) return null;

  const tracks: AdvancedEducationTrack[] = [];
  if (/магистратур/.test(value)) tracks.push("master");
  if (aspirantura) tracks.push("aspirantura");
  if (doctorate) tracks.push("doctorate");
  if (college) tracks.push("college");
  return tracks.length === 1 ? tracks[0] : null;
}

export type EducationPathwayRow = HseExplorerRow & {
  universitySlug: string;
  universityName: string;
  city: string;
  checkedAt: string;
};

/** Project exclusively from the selected publication; never overlay candidate data. */
export function educationPathwayRows(
  catalog: CatalogSnapshot,
  track: AdvancedEducationTrack,
): EducationPathwayRow[] {
  const universities = new Map(
    catalog.universities.map((row) => [row.slug, row]),
  );
  const result: EducationPathwayRow[] = [];
  for (const directory of catalog.directoryDetails) {
    const university = universities.get(directory.universitySlug);
    if (!university) continue;
    const resources = directory.admissionResources;
    if (directory.universitySlug === "hse" && resources) {
      const data = hseExplorerData(
        [],
        directory.offerings,
        resources.masterTuition,
      );
      for (const row of hseExplorerRows(
        data.programs,
        data.offerings,
        data.masterTuition,
      )) {
        if (offeringTrack(row.level) !== track) continue;
        result.push({
          ...row,
          id: `${university.slug}:${row.id}`,
          universitySlug: university.slug,
          universityName: university.shortName,
          city: university.city,
          checkedAt:
            directory.offerings.find((offering) => offering.id === row.id)
              ?.checkedAt ?? "",
        });
      }
      continue;
    }
    const identities = new Set<string>();
    for (const offering of directory.offerings) {
      if (offeringTrack(offering.level) !== track) continue;
      const title =
        track === "college"
          ? offering.title
          : (offering.profile ?? offering.title);
      const identity = JSON.stringify([
        offering.code,
        title,
        offering.forms,
        offering.campus,
        offering.admissionDetails?.schoolBase,
      ]);
      if (identities.has(identity)) continue;
      identities.add(identity);
      result.push({
        id: `${university.slug}:${offering.id}`,
        title,
        code: offering.code,
        campus: offering.campus ?? "Кампус уточняется",
        level: offering.level,
        form: offering.forms ?? "Форма уточняется",
        duration: offering.duration,
        faculty: null,
        sourceUrl: offering.sourceUrl,
        programUrl: offering.programUrl ?? null,
        offering,
        admission: offering.admissionDetails,
        universitySlug: university.slug,
        universityName: university.shortName,
        city: university.city,
        checkedAt: offering.checkedAt,
      });
    }
  }
  return result.sort((left, right) => {
    // Program-specific, sourced admission conditions are useful first.
    const known =
      Number(hseHasKnownConditions(right)) -
      Number(hseHasKnownConditions(left));
    return (
      known ||
      left.universityName.localeCompare(right.universityName, "ru") ||
      left.title.localeCompare(right.title, "ru")
    );
  });
}

export type EducationPathwayContext = {
  key: AdvancedEducationTrack;
  title: string;
  priorEducation: string;
  admissionBasis: string;
  dates: Array<{ label: string; year: number }>;
  notes: string[];
  sources: Array<{ id: string; url: string; title: string; checkedAt: string }>;
};
