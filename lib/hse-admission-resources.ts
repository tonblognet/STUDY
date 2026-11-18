import type { ArchiveData } from "@/components/hse-score-archive";
import type campusServices from "@/data-sources/release/2026-12/evidence/2026-11-16-hse-campus-services.json";
import type { HseMasterTuition } from "./hse-admissions";
import type { EducationPathwayContext } from "./education-pathways";

/** Published with the university profile in the same immutable catalog revision. */
export type HseAdmissionResources = {
  masterTuition: HseMasterTuition[];
  archive: ArchiveData;
  services: typeof campusServices;
  pathways?: EducationPathwayContext[];
};
