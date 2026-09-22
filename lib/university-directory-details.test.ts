import { describe, expect, it } from "vitest";
import { programs, universities } from "./data";
import {
  directoryDetails,
  directoryEvidenceSummary,
  getDirectoryDetails,
} from "./university-directory-details";
import { universityFactProfiles } from "./university-facts";

describe("official university profile evidence", () => {
  it("does not use a registry access attempt as a profile verification date", () => {
    const original = getDirectoryDetails("mgusit")!;
    const summary = directoryEvidenceSummary({
      ...original,
      licenseRegistry: {
        ...original.licenseRegistry,
        checkedAt: "2099-01-01T00:00:00Z",
      },
    });
    expect(summary.hasContacts).toBe(true);
    expect(summary.licenseAsOf).toBe("2025-09-02");
    expect(summary.checkedAt).not.toContain("2099");
    expect(directoryEvidenceSummary({ ...original, fields: {} })).toEqual({
      fieldCount: 0,
      hasContacts: false,
      checkedAt: null,
      licenseAsOf: "2025-09-02",
    });
    expect(directoryEvidenceSummary().checkedAt).toBeNull();
  });
  it("keeps education lists separate from admission contests and matching", () => {
    const ids = new Set(programs.map((p) => p.id));
    for (const profile of directoryDetails) {
      expect(universities.some((u) => u.slug === profile.universitySlug)).toBe(
        true,
      );
      expect(new Set(profile.offerings.map((row) => row.id)).size).toBe(
        profile.offerings.length,
      );
      for (const row of profile.offerings) {
        expect(row.code).toMatch(/^\d{2}\.(03|05)\.\d{2}$/);
        expect(row.admissionsStatus).toBe("pending_review");
        expect(row.sourceYear).toBeNull();
        expect(ids.has(row.id)).toBe(false);
        expect(row.sourceUrl).toMatch(/^https?:\/\//);
        expect(row.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
      }
    }
    // Employment statistics are not evidence of a current program offering.
    expect(getDirectoryDetails("sechenov")?.offerings).toEqual([]);
    expect(getDirectoryDetails("fa")?.offerings).toEqual([]);
  });

  it("does not turn a historical license extract into a live registry confirmation", () => {
    const profile = getDirectoryDetails("mgusit")!;
    expect(profile.licenseExtract?.number).toBe("Л035-00115-77/00096755");
    expect(profile.licenseExtract?.asOf).toBe("2025-09-02");
    expect(profile.licenseRegistry.value).toBe("not_checked");
    for (const row of directoryDetails) {
      if (!row.licenseExtract) continue;
      expect(new Date(row.licenseExtract.asOf).getTime()).toBeLessThanOrEqual(
        new Date(row.licenseExtract.checkedAt).getTime(),
      );
      expect(row.licenseExtract.sourceUrl).toMatch(/^https?:\/\//);
    }
  });

  it("uses dated primary evidence for facts, without treating table headings as hostel facts", () => {
    expect(getDirectoryDetails("msal")?.fields.hostelInfo?.value).toBe(
      "Количество общежитий: 4",
    );
    expect(getDirectoryDetails("guu")?.fields.hostelInfo).toBeUndefined();
    const address = universityFactProfiles.find(
      (p) => p.universitySlug === "mgusit",
    )!.facts.address;
    expect(address.sourceUrl).toBe("https://mgusit.mossport.ru/sveden/common/");
    expect(address.year).toBe(2026);
    for (const row of directoryDetails)
      for (const field of Object.values(row.fields)) {
        expect(field.value).not.toMatch(/\uFFFD||†/);
        expect(field.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
        expect(Number.isNaN(Date.parse(field.checkedAt))).toBe(false);
      }
  });

  it("preserves historical broad education areas as their own entity", () => {
    for (const row of directoryDetails)
      for (const area of row.educationAreas) {
        expect(area.code).toMatch(/^\d{2}\.00\.00$/);
        expect(area.sourceYear).toBe(2025);
        expect(area.sourceUrl).toContain("monitoring.miccedu.ru/");
      }
  });
});
