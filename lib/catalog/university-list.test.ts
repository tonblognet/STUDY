import { describe, expect, it } from "vitest";
import { baselineCatalog } from "./baseline";
import { universityCatalogEntries } from "./university-list";
import { universityViewSchema } from "./view-state";
import { filterUniversities } from "../university-catalog-filters";

describe("public university list projection", () => {
  const catalog = baselineCatalog();
  const entries = universityCatalogEntries(catalog);

  it("keeps all identities and independently counted catalog coverage", () => {
    expect(entries.map((row) => row.slug)).toEqual(
      catalog.universities.map((row) => row.slug),
    );
    for (const row of entries) {
      expect(row.catalogProgramCount).toBe(
        catalog.programs.filter(
          (program) => program.universitySlug === row.slug,
        ).length,
      );
      expect(row.facultyCount).toBe(
        catalog.directoryDetails.find(
          (profile) => profile.universitySlug === row.slug,
        )?.faculties?.length ?? 0,
      );
    }
  });

  it("keeps city, region, legal-name and evidence filtering available", () => {
    for (const university of catalog.universities
      .filter((row) => row.directory?.region)
      .slice(0, 5)) {
      expect(
        filterUniversities(
          entries,
          universityViewSchema.parse({
            query: university.directory!.legalName.slice(0, 190),
          }),
        ).map((row) => row.slug),
      ).toContain(university.slug);
      expect(
        filterUniversities(
          entries,
          universityViewSchema.parse({
            query: university.directory!.region,
            city: university.city,
          }),
        ).map((row) => row.slug),
      ).toContain(university.slug);
    }
    const filtered = filterUniversities(
      entries,
      universityViewSchema.parse({ detailsFilter: "faculties" }),
    );
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((row) => row.facultyCount > 0)).toBe(true);
  });

  it("excludes full provenance and facts from browser list props while preserving server evidence", () => {
    for (const row of entries) {
      expect(row).not.toHaveProperty("foundedYear");
      expect(row).not.toHaveProperty("programsCount");
      expect(row.directory).not.toHaveProperty("sourceSha256");
      expect(row.directory).not.toHaveProperty("sourceUrl");
      expect(row.directory).not.toHaveProperty("note");
    }
    expect(
      catalog.universities.some((row) => row.directory?.sourceSha256),
    ).toBe(true);
    expect(JSON.stringify(entries).length).toBeLessThan(
      JSON.stringify(catalog.universities).length,
    );
  });
});
