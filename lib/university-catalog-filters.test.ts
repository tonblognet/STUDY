import { describe, expect, it } from "vitest";
import { universityViewSchema } from "./catalog/view-state";
import {
  filterUniversities,
  type UniversityCatalogEntry,
} from "./university-catalog-filters";

const fixture = (
  id: string,
  city: string,
  ownership: "state" | "private",
  facultyCount = 0,
): UniversityCatalogEntry => ({
  id,
  slug: id,
  name: `Университет ${id}`,
  shortName: id,
  city,
  address: "Адрес уточняется",
  website: "https://example.edu/",
  color: "#123456",
  description: "",
  militaryCenter: null,
  directory: {
    ownership,
    kind: "university",
    legalName: `Университет ${id}`,
  },
  catalogProgramCount: 0,
  offeringCount: 0,
  facultyCount,
  campaignCount: 0,
  evidence: {
    fieldCount: 0,
    hasContacts: false,
    checkedAt: null,
    licenseAsOf: null,
  },
});

describe("nationwide university filters", () => {
  const entries = [
    fixture("a", "Москва", "state", 2),
    fixture("b", "Казань", "private", 1),
    fixture("c", "Казань", "state"),
    fixture("d", "Орёл", "state"),
  ];
  it("combines city, ownership and faculty evidence without matching admission programs", () => {
    const view = universityViewSchema.parse({
      city: "Казань",
      ownership: "private",
      detailsFilter: "faculties",
    });
    expect(filterUniversities(entries, view).map((entry) => entry.id)).toEqual([
      "b",
    ]);
    expect(
      filterUniversities(
        entries,
        universityViewSchema.parse({
          city: "Казань",
          ownership: "state",
          detailsFilter: "faculties",
        }),
      ),
    ).toEqual([]);
  });
  it("searches the city explicitly and normalizes ё", () => {
    expect(
      filterUniversities(
        entries,
        universityViewSchema.parse({ query: "  орел  " }),
      ).map((entry) => entry.id),
    ).toEqual(["d"]);
    expect(
      filterUniversities(
        entries,
        universityViewSchema.parse({ query: "КАЗАНЬ" }),
      ),
    ).toHaveLength(2);
  });
  it("keeps a missing city empty and reset restores the complete directory", () => {
    expect(
      filterUniversities(
        entries,
        universityViewSchema.parse({ city: "Нет такого города" }),
      ),
    ).toEqual([]);
    expect(filterUniversities(entries, universityViewSchema.parse({}))).toEqual(
      entries,
    );
  });
});
