import { describe, expect, it } from "vitest";
import factsData from "@/data-sources/admissions/facts.json";
import { admissionFactId, admissionFactSchema } from "./facts-schema";
import { groupAdmissionFacts, type AdmissionFact } from "./facts";
import { getDirectoryDetails } from "@/lib/university-directory-details";
import mpeiEvidence from "@/data-sources/release/2026-12/evidence/2026-11-23-mpei-admissions.json";
import bmstuEvidence from "@/data-sources/release/2026-12/evidence/2026-11-21-bmstu-admissions.json";

const facts = factsData.facts as AdmissionFact[];
const of = (slug: string) =>
  facts.filter((fact) => fact.universitySlug === slug);

describe("published admission facts (TASK-2026-11-25, step 4)", () => {
  it("are valid, unique and reproduce their stable ids", () => {
    const ids = new Set<string>();
    for (const fact of facts) {
      expect(() => admissionFactSchema.parse(fact)).not.toThrow();
      const { id, ...rest } = fact;
      expect(admissionFactId(rest)).toBe(id);
      expect(ids.has(id)).toBe(false);
      ids.add(id);
    }
    expect(facts.length).toBe(
      factsData.packages.reduce((sum, row) => sum + row.facts, 0),
    );
  });

  it("copies published numbers exactly, budget and paid separately", () => {
    const group = mpeiEvidence.publishedPassingScores2026.groups[0];
    const mpei = of("mpei").filter(
      (fact) =>
        fact.year === 2026 &&
        fact.code === group.code &&
        fact.label === group.group &&
        fact.kind === "passing_score",
    );
    expect(
      Object.fromEntries(mpei.map((fact) => [fact.funding, fact.value])),
    ).toEqual({ budget: group.budget.score, paid: group.paid.score });

    const paid = bmstuEvidence.paidArchive.rows[0];
    const minimum = paid.results["2025"]![1];
    expect(
      of("bmstu").find(
        (fact) =>
          fact.kind === "passing_score" &&
          fact.funding === "paid" &&
          fact.code === paid.code &&
          fact.year === 2025,
      )?.value,
    ).toBe(minimum);
    // A budget value is never derived from a paid one or the reverse.
    for (const fact of facts)
      if (fact.kind === "tuition") expect(fact.funding).toBe("paid");
  });

  it("matches the totals recorded in the reviewed evidence", () => {
    const passing = (slug: string) =>
      of(slug).filter((fact) => fact.kind === "passing_score").length;
    expect(passing("rudn")).toBe(847);
    expect(passing("rsuh")).toBe(482);
    expect(
      of("mospolytech").filter(
        (fact) => fact.kind === "passing_score" && fact.funding === "paid",
      ),
    ).toHaveLength(69);
  });

  it("keeps footnotes and refuses facts without a published year", () => {
    const msalBudget = of("msal").filter(
      (fact) => fact.kind === "passing_score" && fact.funding === "budget",
    );
    expect(msalBudget.length).toBeGreaterThan(0);
    for (const fact of msalBudget) expect(fact.note).toMatch(/квот/);
    // MUCTR's archived minimums carry no year in the source.
    expect(of("muctr").some((fact) => fact.kind === "passing_score")).toBe(
      false,
    );
  });

  it("are attached to the university profile and grouped as published", () => {
    expect(getDirectoryDetails("mpei")?.admissionFacts).toHaveLength(
      of("mpei").length,
    );
    const groups = groupAdmissionFacts(of("msal"));
    const keys = groups.map((group) =>
      JSON.stringify([group.code, group.label, group.form, group.campus]),
    );
    expect(new Set(keys).size).toBe(groups.length);
    for (const group of groups)
      for (let i = 1; i < group.facts.length; i++)
        expect(group.facts[i - 1].year).toBeGreaterThanOrEqual(
          group.facts[i].year,
        );
  });
});
