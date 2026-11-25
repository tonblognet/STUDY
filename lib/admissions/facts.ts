/**
 * Published admission results and conditions of a university (TASK-2026-11-25,
 * step 4; plan FULL_CATALOG_AFTER_LAYER_07). One fact is one published number:
 * a passing score, an application minimum, a number of places or a price, for
 * one group as the university labels it, one year and one funding basis.
 * Budget and paid values are separate facts and never copied into each other.
 * Unknown stage, competition or scale stay null; a fact without a year is not
 * recorded at all. Groups are kept as published: a shared code never merges
 * different groups, forms, campuses or profiles.
 */
export const admissionFactKinds = [
  "passing_score",
  "minimum_to_apply",
  "places",
  "tuition",
] as const;

export type AdmissionFact = {
  id: string;
  universitySlug: string;
  year: number;
  kind: (typeof admissionFactKinds)[number];
  funding: "budget" | "paid" | null;
  /** As published: «общий конкурс», «целевая квота», «без общежития», … */
  competition: string | null;
  stage: string | null;
  /** Code(s) as published; null when the source names the group only. */
  code: string | null;
  label: string;
  form: string | null;
  campus: string | null;
  value: number;
  unit: "points" | "places" | "rub";
  /** Billing period of a price, when the source states it. */
  period: "year" | "semester" | null;
  note: string | null;
  source: {
    url: string;
    checkedAt: string;
    sha256: string | null;
    section: string | null;
  };
};

export type AdmissionFactGroup = {
  key: string;
  code: string | null;
  label: string;
  form: string | null;
  campus: string | null;
  facts: AdmissionFact[];
};

/** Group facts exactly as published (code, label, form, campus), newest first. */
export function groupAdmissionFacts(
  facts: readonly AdmissionFact[],
): AdmissionFactGroup[] {
  const groups = new Map<string, AdmissionFactGroup>();
  for (const fact of facts) {
    const key = JSON.stringify([fact.code, fact.label, fact.form, fact.campus]);
    const group = groups.get(key) ?? {
      key,
      code: fact.code,
      label: fact.label,
      form: fact.form,
      campus: fact.campus,
      facts: [],
    };
    group.facts.push(fact);
    groups.set(key, group);
  }
  for (const group of groups.values())
    group.facts.sort(
      (a, b) =>
        b.year - a.year ||
        a.kind.localeCompare(b.kind) ||
        String(a.funding).localeCompare(String(b.funding)),
    );
  return [...groups.values()].sort(
    (a, b) =>
      (a.code ?? "~").localeCompare(b.code ?? "~") ||
      a.label.localeCompare(b.label, "ru") ||
      String(a.form).localeCompare(String(b.form), "ru"),
  );
}
