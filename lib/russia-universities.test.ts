import { describe, expect, it } from "vitest";
import moscow from "@/data-sources/moscow/universities.json";
import { getUniversityAdapter } from "@/data-sources/universities";
import { assertOfficialSource } from "@/data-sources/core/adapter";
import { programs, universities, type University } from "./data";
import { universityFactProfiles } from "./university-facts";
import {
  completeRussiaDirectory,
  russiaUniversities,
} from "./russia-universities";

describe("regional university directory", () => {
  it("adds universities outside Moscow with dated government provenance", () => {
    expect(russiaUniversities.length).toBeGreaterThan(0);
    const moscowIds = new Set(
      moscow.universities.map(
        (university) => university.directory.monitoringId,
      ),
    );
    const slugs = new Set<string>();
    const monitoringIds = new Set<string>();
    for (const university of russiaUniversities) {
      const evidence = university.directory!;
      expect(slugs.has(university.slug), university.slug).toBe(false);
      expect(monitoringIds.has(evidence.monitoringId), university.slug).toBe(
        false,
      );
      expect(moscowIds.has(evidence.monitoringId), university.slug).toBe(false);
      slugs.add(university.slug);
      monitoringIds.add(evidence.monitoringId);
      expect(evidence.sourceYear).toBe(2025);
      expect(new URL(evidence.sourceUrl).hostname).toBe(
        "monitoring.miccedu.ru",
      );
      expect(evidence.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(Number.isNaN(Date.parse(evidence.checkedAt))).toBe(false);
      expect(evidence.region?.length).toBeGreaterThan(0);
      expect(evidence.federalDistrict?.length).toBeGreaterThan(0);
      expect(evidence.listSourceUrl).toMatch(
        /^https:\/\/monitoring\.miccedu\.ru\//,
      );
      const website = new URL(university.website);
      expect(website.protocol).toMatch(/^https?:$/);
      expect(website.username, university.slug).toBe("");
      expect(website.password, university.slug).toBe("");
      expect(universities.find((row) => row.slug === university.slug)).toEqual(
        university,
      );
    }
    expect(
      universities.some((university) => university.city === "Санкт-Петербург"),
    ).toBe(true);
    expect(
      new Set(universities.map((university) => university.slug)).size,
    ).toBe(universities.length);
  });

  it("preserves existing entries and deduplicates slugs, IDs and monitoring identities", () => {
    const existing = universities[0];
    const regional = (slug: string, monitoringId: string): University => ({
      ...existing,
      id: slug,
      slug,
      name: "Одинаковое название организации",
      city: "Другой город",
      directory: { ...existing.directory!, monitoringId },
    });
    const addition = regional("regional-unit", "new-monitoring-id");
    const repeatedInstitution = regional(
      "renamed-existing-unit",
      existing.directory!.monitoringId,
    );
    const repeatedSlug = { ...addition, slug: existing.slug };
    const repeatedId = { ...addition, id: existing.id };
    const repeatedAddition = regional("different-slug", "new-monitoring-id");
    const merged = completeRussiaDirectory(
      [existing],
      [
        repeatedInstitution,
        repeatedSlug,
        repeatedId,
        addition,
        repeatedAddition,
      ],
    );
    expect(merged).toEqual([existing, addition]);
    expect(merged[0]).toBe(existing);
    expect(completeRussiaDirectory(merged, [addition])).toEqual(merged);
  });

  it("preserves quotation marks inside published institution names", () => {
    expect(
      russiaUniversities.find(
        (university) => university.slug === "russia-110154",
      )?.name,
    ).toContain('"Высшая школа нефти"');
    expect(
      russiaUniversities.find((university) => university.slug === "russia-1706")
        ?.name,
    ).toContain(
      "«Российский государственный университет народного хозяйства имени В.И. Вернадского»",
    );
  });

  it("keeps different institutions with the same name and missing monitoring IDs separate", () => {
    const first: University = {
      ...universities[0],
      id: "first-regional-unit",
      slug: "first-regional-unit",
      directory: undefined,
    };
    const second = {
      ...first,
      id: "second-regional-unit",
      slug: "second-regional-unit",
    };
    expect(completeRussiaDirectory([], [first, second])).toEqual([
      first,
      second,
    ]);
  });

  it("registers regional institutions without inventing matcher programs", () => {
    for (const university of russiaUniversities) {
      expect(
        programs.filter((row) => row.universitySlug === university.slug),
      ).toEqual([]);
      const profile = universityFactProfiles.find(
        (row) => row.universitySlug === university.slug,
      )!;
      expect(profile, university.slug).toBeDefined();
      expect(profile.facts.militaryCenter.value).toBeNull();
      expect(profile.facts.militaryCenter.status).toBe("pending_review");
      expect(profile.facts.dormitoryCount.value).toBeNull();
      expect(profile.facts.dormitoryCount.status).toBe("pending_review");
      const adapter = getUniversityAdapter(university.slug)!;
      expect(adapter, university.slug).toBeDefined();
      expect(() =>
        assertOfficialSource(adapter, {
          category: "facts",
          url: university.directory!.sourceUrl,
          title: university.name,
          year: university.directory!.sourceYear,
          format: "html",
        }),
      ).not.toThrow();
      expect(() =>
        assertOfficialSource(adapter, {
          category: "facts",
          url: "https://unrelated.example/data",
          title: "Чужой источник",
          year: 2026,
          format: "html",
        }),
      ).toThrow();
    }
    expect(programs).toHaveLength(185);
  });
});
