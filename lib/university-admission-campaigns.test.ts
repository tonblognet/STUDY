import { describe, expect, it } from "vitest";
import { programs } from "./data";
import {
  admissionCampaigns,
  getAdmissionCampaign,
  validateAdmissionCampaign,
} from "./university-admission-campaigns";
import { getUniversityAdapter } from "@/data-sources/universities";
import { assertOfficialSource } from "@/data-sources/core/adapter";

describe("separately sourced admission campaigns", () => {
  it("rejects invalid dates, non-finite minima and fractional places", () => {
    const campaign = structuredClone(getAdmissionCampaign("balletacademy")!);
    campaign.mainApplicationPeriod.closes = "2026-01-01";
    campaign.examMinimums[0].minimum = Number.NaN;
    campaign.groups[0].budgetPlaces.value = 1.5;
    const errors = validateAdmissionCampaign(campaign);
    expect(errors).toContain("Invalid application period");
    expect(errors).toContain(
      `Invalid exam minimum: ${campaign.examMinimums[0].title}`,
    );
    expect(errors).toContain(`Non-integer places: ${campaign.groups[0].id}`);
  });
  it("preserves shared places once and distinguishes unknown from zero", () => {
    const campaign = getAdmissionCampaign("balletacademy")!;
    expect(
      campaign.groups.reduce(
        (sum, group) => sum + (group.budgetPlaces.value ?? 0),
        0,
      ),
    ).toBe(32);
    const shared = campaign.groups.filter((group) => group.sharedPlaces);
    expect(shared).toHaveLength(1);
    expect(shared[0].profiles).toHaveLength(2);
    expect(shared[0].paidPlaces.value).toBe(8);
    expect(shared[0].budgetPlaces.value).toBe(0);
    expect(
      campaign.groups.find((g) => g.code === "52.03.02")?.paidPlaces.value,
    ).toBeNull();
    expect(
      campaign.groups.find((g) => g.id.endsWith("folk"))?.tuition.value,
    ).toBeNull();
  });
  it("keeps two creative minima and does not flatten groups into single-DVI matching", () => {
    const campaign = getAdmissionCampaign("balletacademy")!;
    expect(campaign.examMinimums.map((exam) => exam.minimum)).toEqual([
      50, 50, 40, 40,
    ]);
    expect(
      programs.some((program) =>
        campaign.groups.some((group) => group.id === program.id),
      ),
    ).toBe(false);
    for (const group of campaign.groups)
      for (const profile of group.profiles)
        expect(profile.exams).toHaveLength(4);
  });
  it("validates provenance and catches missing sources and duplicate groups", () => {
    for (const campaign of admissionCampaigns) {
      expect(validateAdmissionCampaign(campaign)).toEqual([]);
      const adapter = getUniversityAdapter(campaign.universitySlug)!;
      for (const source of Object.values(campaign.sources)) {
        expect(() =>
          assertOfficialSource(
            adapter,
            adapter.sources.find((row) => row.url === source.url)!,
          ),
        ).not.toThrow();
        expect(adapter.sources.some((row) => row.url === source.url)).toBe(
          true,
        );
      }
      expect(
        validateAdmissionCampaign({ ...campaign, sources: {} }).length,
      ).toBeGreaterThan(0);
      expect(
        validateAdmissionCampaign({
          ...campaign,
          groups: [...campaign.groups, campaign.groups[0]],
        }),
      ).toContain(`Duplicate group: ${campaign.groups[0].id}`);
    }
  });
});
