import { describe, expect, it } from "vitest";
import evidence from "@/data-sources/release/2026-12/evidence/2026-11-18-rea-mpek-college-intake-evidence.json";
import enrichment from "@/data-sources/russia/rea-mpek-college-enrichment-2026-11-18.json";
import { baselineCatalog } from "@/lib/catalog/baseline";
import { parseCatalog } from "@/lib/catalog/schema";
import { educationPathwayRows } from "./education-pathways";
import { filterHseExplorerRows } from "./hse-explorer-data";

function collegeCatalog() {
  const catalog = baselineCatalog();
  catalog.programs = catalog.programs.filter(
    (row) => row.universitySlug === "rea",
  );
  catalog.universities = catalog.universities.filter(
    (row) => row.slug === "rea",
  );
  catalog.universityFacts = catalog.universityFacts.filter(
    (row) => row.universitySlug === "rea",
  );
  catalog.directoryDetails = catalog.directoryDetails.filter(
    (row) => row.universitySlug === "rea",
  );
  catalog.admissionCampaigns = catalog.admissionCampaigns.filter(
    (row) => row.universitySlug === "rea",
  );
  return catalog;
}

describe("college admissions with separate school-entry routes", () => {
  it("preserves all eleven published routes and counts plan places once", () => {
    const rows = enrichment.profiles[0].offerings;
    expect(rows).toHaveLength(11);
    expect(new Set(rows.map((row) => row.code)).size).toBe(5);
    expect(new Set(rows.map((row) => row.id)).size).toBe(11);
    expect(
      rows.reduce(
        (sum, row) => sum + (row.admissionDetails.budgetPlaces.value ?? 0),
        0,
      ),
    ).toBe(130);
    expect(
      rows.reduce(
        (sum, row) => sum + (row.admissionDetails.paidPlaces.value ?? 0),
        0,
      ),
    ).toBe(410);
    for (const row of rows) {
      expect(row.admissionDetails.note).toContain("незаполненные");
      expect(row.sourceYear).toBe(2026);
      expect(row.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    }
    expect(JSON.stringify(evidence)).not.toMatch(/[A-Z]:[\\/]/);
  });

  it("shows actual programme names and separates the two entry bases without invented budget", () => {
    const rows = educationPathwayRows(collegeCatalog(), "college");
    expect(rows).toHaveLength(11);
    expect(rows.some((row) => row.title.includes("Дизайн"))).toBe(true);
    const design = rows.find(
      (row) => row.code === "54.02.01" && row.admission?.schoolBase === 9,
    )!;
    expect(design.admission?.annualTuition?.value).toBe(660000);
    expect(design.admission?.exams?.value).toContain("Рисунок");
    expect(filterHseExplorerRows([design], { maxTuition: "659999" })).toEqual(
      [],
    );
    expect(
      filterHseExplorerRows([design], { maxTuition: "660000" }),
    ).toHaveLength(1);
    expect(
      rows
        .filter((row) => row.admission?.schoolBase === 11)
        .every((row) => row.admission?.budgetPlaces?.value === null),
    ).toBe(true);
    expect(
      filterHseExplorerRows(
        rows.filter((row) => row.admission?.schoolBase === 11),
        { funding: "budget" },
      ),
    ).toEqual([]);
  });

  it("validates imported facts, grade bases and reviewed college links in the same publication", () => {
    const catalog = collegeCatalog();
    expect(() => parseCatalog(catalog)).not.toThrow();
    const college = catalog.directoryDetails
      .find((row) => row.universitySlug === "rea")!
      .offerings.find((row) => row.admissionDetails)!;
    college.admissionDetails!.annualTuition!.value = -1;
    expect(() => parseCatalog(catalog)).toThrow();
    college.admissionDetails!.annualTuition!.value = 220000;
    college.admissionDetails!.schoolBase = 10 as 9;
    expect(() => parseCatalog(catalog)).toThrow();
    college.admissionDetails!.schoolBase = 9;
    college.admissionDetails!.exams!.sourceUrl =
      "https://unreviewed.example/college";
    expect(() => parseCatalog(catalog)).toThrow();
  });
});
