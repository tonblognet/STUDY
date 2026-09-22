import type { Program, University } from "@/lib/data";
import type { UniversityFactProfile } from "@/lib/university-facts";
import type { DirectoryDetails } from "@/lib/university-directory-details";
import type { AdmissionCampaign } from "@/lib/university-admission-campaigns";

/** One immutable editorial publication, shared by every public catalog route. */
export type CatalogSnapshot = {
  schemaVersion: 1;
  programs: Program[];
  universities: University[];
  universityFacts: UniversityFactProfile[];
  directoryDetails: DirectoryDetails[];
  admissionCampaigns: AdmissionCampaign[];
};

export type CatalogChange = {
  path: string;
  before: unknown;
  after: unknown;
  suspicious: boolean;
};

export class CatalogError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "CatalogError";
  }
}
