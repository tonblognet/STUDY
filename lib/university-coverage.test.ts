import { describe, expect, it } from "vitest";
import { universities, programs } from "./data";
import { universityCoverageGaps } from "./university-coverage";
import { getDirectoryDetails } from "./university-directory-details";

describe("university coverage gaps", () => {
  it("keeps missing educational listings visible when admission programs exist", () => {
    const uncollectedListingGaps = universityCoverageGaps(
      { fields: {}, offerings: [] },
      1,
    );
    expect(uncollectedListingGaps).toContain("educationalListings");
    expect(uncollectedListingGaps).not.toContain("admissionPrograms");

    const entries = universities.filter(
      (university) =>
        programs.some((row) => row.universitySlug === university.slug) &&
        !getDirectoryDetails(university.slug)?.offerings.length,
    );
    for (const university of entries) {
      const gaps = universityCoverageGaps(
        getDirectoryDetails(university.slug),
        programs.filter((row) => row.universitySlug === university.slug).length,
      );
      expect(gaps, university.slug).toContain("educationalListings");
      expect(gaps, university.slug).not.toContain("admissionPrograms");
    }
  });

  it("clears the educational-listing gap for HSE after its official listings are collected", () => {
    const profile = getDirectoryDetails("hse");
    const admissionProgramCount = programs.filter(
      (row) => row.universitySlug === "hse",
    ).length;
    expect(profile?.offerings.length).toBeGreaterThan(0);
    expect(admissionProgramCount).toBeGreaterThan(0);
    const gaps = universityCoverageGaps(profile, admissionProgramCount);
    expect(gaps).not.toContain("educationalListings");
    expect(gaps).not.toContain("admissionPrograms");
  });

  it("keeps missing admission programs visible when implemented listings exist", () => {
    const entries = universities.filter(
      (university) =>
        !programs.some((row) => row.universitySlug === university.slug) &&
        (getDirectoryDetails(university.slug)?.offerings.length ?? 0) > 0,
    );
    expect(entries.map((university) => university.slug)).toEqual(
      expect.arrayContaining(["sfi", "russia-1771"]),
    );
    for (const university of entries) {
      const gaps = universityCoverageGaps(
        getDirectoryDetails(university.slug),
        0,
      );
      expect(gaps, university.slug).toContain("admissionPrograms");
      expect(gaps, university.slug).not.toContain("educationalListings");
    }
  });

  it("reports both program gaps when neither source has been collected", () => {
    expect(universityCoverageGaps(undefined, 0)).toEqual(
      expect.arrayContaining([
        "educationalListings",
        "admissionPrograms",
        "faculties",
      ]),
    );
  });
});
