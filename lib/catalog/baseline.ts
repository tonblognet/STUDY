import { programs, universities } from "@/lib/data";
import { universityFactProfiles } from "@/lib/university-facts";
import { directoryDetails } from "@/lib/university-directory-details";
import { admissionCampaigns } from "@/lib/university-admission-campaigns";
import type { CatalogSnapshot } from "./types";

/** Repository evidence is an import candidate, never an implicit DB fallback. */
export function baselineCatalog(): CatalogSnapshot {
  return JSON.parse(
    JSON.stringify({
      schemaVersion: 1,
      programs: programs.map((program) => ({
        ...program,
        passingScore:
          program.passingScoreValue.status === "verified"
            ? program.passingScoreValue.value
            : null,
        budgetPlaces:
          program.budgetPlacesValue.status === "verified"
            ? program.budgetPlacesValue.value
            : null,
        paidPlaces:
          program.paidPlacesValue.status === "verified"
            ? program.paidPlacesValue.value
            : null,
        tuition:
          program.tuitionValue.status === "verified"
            ? program.tuitionValue.value
            : null,
      })),
      universities,
      universityFacts: universityFactProfiles,
      directoryDetails,
      admissionCampaigns,
    }),
  ) as CatalogSnapshot;
}
