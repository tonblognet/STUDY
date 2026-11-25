import type { EducationPathwayRow } from "@/lib/education-pathways";
import {
  filterHseExplorerRows,
  hseAdmissionYears,
  hseCampusNames,
  hseStudyModes,
  type HseExplorerFilters,
} from "@/lib/hse-explorer-data";

/**
 * Server-side filtering of an education track (ADR 0006): the full listing of
 * a track can hold tens of thousands of rows, so the browser receives only the
 * requested page and the filter options, never the whole track.
 */
export type PathwayQuery = HseExplorerFilters & {
  university: string;
  schoolBase: "" | "9" | "11";
  limit: number;
};

export type PathwayView = {
  query: PathwayQuery;
  rows: EducationPathwayRow[];
  total: number;
  matched: number;
  options: {
    universities: Array<[slug: string, name: string]>;
    campuses: string[];
    faculties: string[];
    forms: string[];
    years: number[];
    schoolBase: boolean;
  };
};

export const PATHWAY_PAGE = 12;
export const PATHWAY_STEP = 24;
const PATHWAY_MAX = 600;

type Search = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return (raw ?? "").trim().slice(0, 200);
}

export function pathwayQuery(search: Search): PathwayQuery {
  const pick = <T extends string>(value: string, allowed: readonly T[]) =>
    (allowed as readonly string[]).includes(value) ? (value as T) : ("" as T);
  const limit = Number.parseInt(single(search.limit), 10);
  const maxTuition = single(search.maxTuition);
  const year = single(search.year);
  return {
    query: single(search.q),
    university: single(search.university),
    campus: single(search.campus),
    faculty: single(search.faculty),
    form: single(search.form) as HseExplorerFilters["form"],
    funding: pick(single(search.funding), ["budget", "paid"] as const),
    maxTuition: /^\d{1,9}$/.test(maxTuition) ? maxTuition : "",
    year: /^\d{4}$/.test(year) ? year : "",
    conditions: pick(single(search.conditions), [
      "known",
      "needs-review",
    ] as const),
    schoolBase: pick(single(search.school), ["9", "11"] as const),
    limit:
      Number.isFinite(limit) && limit > 0
        ? Math.min(limit, PATHWAY_MAX)
        : PATHWAY_PAGE,
  };
}

/** Query string of a view; empty values are omitted. */
export function pathwaySearch(
  track: string,
  query: PathwayQuery,
  overrides: Partial<Record<string, string>> = {},
): string {
  const entries: Record<string, string> = {
    track,
    q: query.query ?? "",
    university: query.university,
    campus: query.campus ?? "",
    faculty: query.faculty ?? "",
    form: query.form ?? "",
    funding: query.funding ?? "",
    maxTuition: query.maxTuition ?? "",
    year: query.year ?? "",
    conditions: query.conditions ?? "",
    school: query.schoolBase,
    limit: query.limit === PATHWAY_PAGE ? "" : String(query.limit),
    ...overrides,
  };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(entries))
    if (value) params.set(key, value);
  return `?${params.toString()}`;
}

export function pathwayView(
  rows: EducationPathwayRow[],
  query: PathwayQuery,
): PathwayView {
  const universities = [
    ...new Map(
      rows.map((row) => [row.universitySlug, row.universityName]),
    ).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1], "ru"));
  const scoped = query.university
    ? rows.filter((row) => row.universitySlug === query.university)
    : rows;
  const filtered = filterHseExplorerRows(
    scoped.filter(
      (row) =>
        !query.schoolBase ||
        row.admission?.schoolBase === Number(query.schoolBase),
    ),
    query,
  );
  return {
    query,
    rows: filtered.slice(0, query.limit),
    total: rows.length,
    matched: filtered.length,
    options: {
      universities,
      campuses: [
        ...new Set(scoped.flatMap((row) => hseCampusNames(row.campus))),
      ].sort((a, b) => a.localeCompare(b, "ru")),
      faculties: [
        ...new Set(
          scoped
            .map((row) => row.faculty)
            .filter((value): value is string => Boolean(value)),
        ),
      ].sort((a, b) => a.localeCompare(b, "ru")),
      forms: [...new Set(scoped.flatMap(hseStudyModes))],
      years: [...new Set(scoped.flatMap(hseAdmissionYears))].sort(
        (a, b) => b - a,
      ),
      schoolBase: rows.some((row) => row.admission?.schoolBase),
    },
  };
}
