import snapshot from "@/data-sources/moscow/admission-campaigns.json";

export type CampaignSource = {
  url: string;
  title: string;
  kind: "pdf" | "docx";
  checkedAt: string;
  sha256: string;
};
export type CampaignFact<T> = {
  value: T | null;
  source: string | null;
  section: string;
};
export type AdmissionCampaign = {
  universitySlug: string;
  year: number;
  campus: string;
  admissionsUrl: string;
  sources: Record<string, CampaignSource>;
  groups: Array<{
    id: string;
    code: string;
    title: string;
    form: string;
    sharedPlaces: boolean;
    profiles: Array<{ title: string; exams: string[] }>;
    duration: CampaignFact<string>;
    budgetPlaces: CampaignFact<number>;
    paidPlaces: CampaignFact<number>;
    tuition: CampaignFact<number>;
  }>;
  examMinimums: Array<{ title: string; minimum: number; source: string }>;
  mainApplicationPeriod: {
    opens: string;
    closes: string;
    source: string;
    section: string;
  };
  notes: string[];
};

// These campaigns retain separate creative exams and shared place pools.
// They must not be flattened into the single-DVI matching model.
export const admissionCampaigns = snapshot.campaigns as AdmissionCampaign[];

export const getAdmissionCampaign = (slug: string) =>
  admissionCampaigns.find((campaign) => campaign.universitySlug === slug);

export function validateAdmissionCampaign(
  campaign: AdmissionCampaign,
): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const sourceExists = (key: string | null) =>
    key !== null && Boolean(campaign.sources[key]);
  for (const group of campaign.groups) {
    if (ids.has(group.id)) errors.push(`Duplicate group: ${group.id}`);
    ids.add(group.id);
    if (
      !group.profiles.length ||
      (group.profiles.length > 1 && !group.sharedPlaces)
    )
      errors.push(`Unspecified place scope: ${group.id}`);
    for (const fact of [
      group.duration,
      group.budgetPlaces,
      group.paidPlaces,
      group.tuition,
    ]) {
      if (fact.value !== null && !sourceExists(fact.source))
        errors.push(`Missing fact source: ${group.id}`);
      if (
        typeof fact.value === "number" &&
        (!Number.isFinite(fact.value) || fact.value < 0)
      )
        errors.push(`Invalid quantity: ${group.id}`);
    }
  }
  for (const minimum of campaign.examMinimums)
    if (
      !sourceExists(minimum.source) ||
      !Number.isInteger(minimum.minimum) ||
      minimum.minimum < 0 ||
      minimum.minimum > 100
    )
      errors.push(`Invalid exam minimum: ${minimum.title}`);
  if (!sourceExists(campaign.mainApplicationPeriod.source))
    errors.push("Missing application period source");
  const opens = Date.parse(campaign.mainApplicationPeriod.opens);
  const closes = Date.parse(campaign.mainApplicationPeriod.closes);
  if (!Number.isFinite(opens) || !Number.isFinite(closes) || opens > closes)
    errors.push("Invalid application period");
  for (const group of campaign.groups)
    for (const fact of [group.budgetPlaces, group.paidPlaces])
      if (fact.value !== null && !Number.isInteger(fact.value))
        errors.push(`Non-integer places: ${group.id}`);
  for (const source of Object.values(campaign.sources)) {
    if (
      !/^https:\/\//.test(source.url) ||
      !/^[a-f0-9]{64}$/.test(source.sha256) ||
      !Number.isFinite(Date.parse(source.checkedAt))
    )
      errors.push(`Invalid source: ${source.title}`);
  }
  return errors;
}
