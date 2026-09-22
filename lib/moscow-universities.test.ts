import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import directory from "../data-sources/moscow/universities.json";
import monitoringIndex from "../data-sources/moscow/monitoring-index-2025.json";
import { universityImportScope } from "../data-sources/core/import-scope";
import {
  getUniversityAdapter,
  universityAdapters,
} from "../data-sources/universities";
import { programs, universities } from "./data";
import { universityFactProfiles } from "./university-facts";
import { universityTypeLabel } from "./moscow-universities";

describe("Moscow university directory", () => {
  it("covers the monitoring snapshot without duplicating the merged Diplomatic Academy", () => {
    const ids = directory.universities.map((u) => u.directory.monitoringId);
    expect(ids.filter((id) => /^\d+$/.test(id))).toHaveLength(150);
    expect(ids).not.toContain("1798");
    expect(ids.filter((id) => /^\d+$/.test(id)).sort()).toEqual(
      monitoringIndex
        .map((row) => row.monitoringId)
        .filter((id) => id !== "1798")
        .sort(),
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(universities.map((u) => u.slug)).size).toBe(
      universities.length,
    );
    expect(programs).toHaveLength(185);
    expect(programs.filter((p) => p.universitySlug === "mgu")).toHaveLength(85);
  });

  it("keeps ownership, branches and Moscow Oblast visible", () => {
    expect(
      universityTypeLabel(universities.find((u) => u.slug === "rosnou")!),
    ).toBe("Негосударственный вуз");
    expect(
      universityTypeLabel(universities.find((u) => u.slug === "mirea")!),
    ).toBe("Государственный вуз");
    expect(
      universityTypeLabel(universities.find((u) => u.slug === "rmat-moscow")!),
    ).toContain("филиал");
    expect(universities.find((u) => u.slug === "mipt")!.city).toBe(
      "Долгопрудный",
    );
    expect(universities.find((u) => u.slug === "miet")!.city).toBe(
      "Зеленоград",
    );
  });

  it("replaces abandoned official domains and does not invent missing facts", () => {
    expect(universities.find((u) => u.slug === "kosygin")!.website).toBe(
      "https://rguk.ru/",
    );
    expect(universities.find((u) => u.slug === "surikov")!.website).toBe(
      "https://surikov-vuz.com/",
    );
    expect(universities.find((u) => u.slug === "mmu")!.website).toBe(
      "https://mi.university/",
    );
    for (const slug of ["avr", "imeii"]) {
      const profile = universityFactProfiles.find(
        (p) => p.universitySlug === slug,
      )!;
      expect(profile.facts.address.value).toBeNull();
      expect(profile.facts.address.status).toBe("pending_review");
      expect(profile.facts.address.checkedAt).toBe("2026-09-15T00:00:00.000Z");
      expect(profile.campuses).toEqual([]);
      expect(profile.facts.militaryCenter.value).toBeNull();
    }
  });

  it("imports university-only profiles and respects a selected adapter", () => {
    expect(programs.filter((p) => p.universitySlug === "rosnou")).toEqual([]);
    expect(
      universityImportScope(
        [getUniversityAdapter("rosnou")!],
        universityFactProfiles,
      ).map((p) => p.universitySlug),
    ).toEqual(["rosnou"]);
    expect(
      universityImportScope(universityAdapters, universityFactProfiles),
    ).toHaveLength(universities.length);
    expect(universityImportScope([], universityFactProfiles)).toEqual([]);
  });

  it("keeps reviewed local logos intact and excludes unrelated partner images", () => {
    for (const university of universities) {
      if (!university.logoUrl?.startsWith("/university-logos/moscow/"))
        continue;
      const bytes = readFileSync(`public${university.logoUrl}`);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        university.directory?.logoSha256,
      );
      expect(university.directory?.logoAssetSourceUrl).toMatch(/^https?:\/\//);
      expect(university.directory?.logoAssetSourceUrl).not.toMatch(
        /kosygin-rgu|surikov-vuz\.ru|urait-logo|mvd-emblem|visa-logo/,
      );
    }
  });
});
