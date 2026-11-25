import snapshot from "@/data-sources/moscow/profiles.json";
import regionalSnapshot from "@/data-sources/russia/profiles.json";
import enrichment from "@/data-sources/russia/moscow-enrichment-2026-10-09.json";
import regionalEnrichment from "@/data-sources/russia/regional-enrichment-2026-10-09.json";
import regionalEnrichmentOctober10 from "@/data-sources/russia/regional-enrichment-2026-10-10.json";
import moscowEnrichmentOctober10 from "@/data-sources/russia/moscow-enrichment-2026-10-10.json";
import moscowEnrichmentOctober11 from "@/data-sources/russia/moscow-enrichment-2026-10-11.json";
import regionalEnrichmentOctober11 from "@/data-sources/russia/regional-enrichment-2026-10-11.json";
import moscowEnrichmentOctober20 from "@/data-sources/russia/moscow-enrichment-2026-10-20.json";
import regionalNorthEnrichmentOctober20 from "@/data-sources/russia/regional-north-enrichment-2026-10-20.json";
import regionalSouthEnrichmentOctober20 from "@/data-sources/russia/regional-south-enrichment-2026-10-20.json";
import moscowEnrichmentOctober22 from "@/data-sources/russia/moscow-enrichment-2026-10-22.json";
import regionalEnrichmentOctober22 from "@/data-sources/russia/regional-enrichment-2026-10-22.json";
import contactsEnrichmentOctober22 from "@/data-sources/russia/contacts-enrichment-2026-10-22.json";
import regionalEducationOctober25 from "@/data-sources/russia/regional-education-enrichment-2026-10-25.json";
import regionalStructureOctober25 from "@/data-sources/russia/regional-structure-enrichment-2026-10-25.json";
import contactsEnrichmentOctober25 from "@/data-sources/russia/contacts-enrichment-2026-10-25.json";
import coreEnrichmentNovember9 from "@/data-sources/russia/core-enrichment-2026-11-09.json";
import moscowEnrichmentNovember9 from "@/data-sources/russia/moscow-priority-enrichment-2026-11-09.json";
import southEastEnrichmentNovember9 from "@/data-sources/russia/south-east-enrichment-2026-11-09.json";
import uralNsuEnrichmentNovember9 from "@/data-sources/russia/ural-nsu-enrichment-2026-11-09.json";
import continuationEducationNovember9 from "@/data-sources/russia/continuation-education-2026-11-09.json";
import continuationContactsNovember9 from "@/data-sources/russia/continuation-contacts-2026-11-09.json";
import continuationStructureNovember9 from "@/data-sources/russia/continuation-structure-2026-11-09.json";
import followupRegionalEducationNovember9 from "@/data-sources/russia/followup-regional-education-2026-11-09.json";
import followupCentralEducationNovember9 from "@/data-sources/russia/followup-central-education-2026-11-09.json";
import followupContactsNovember9 from "@/data-sources/russia/followup-contacts-2026-11-09.json";
import moscowOverviewNovember10 from "@/data-sources/russia/moscow-overview-enrichment-2026-11-10.json";
import moscowHseNovember10 from "@/data-sources/russia/moscow-hse-enrichment-2026-11-10.json";
import hseFullEducationNovember16 from "@/data-sources/russia/hse-full-education-2026-11-16.json";
import hseAdditionalEducationNovember18 from "@/data-sources/russia/hse-additional-education-2026-11-18.json";
import moscowMiptNovember10 from "@/data-sources/russia/moscow-mipt-enrichment-2026-11-10.json";
import moscowMisisNovember10 from "@/data-sources/russia/moscow-misis-enrichment-2026-11-10.json";
import moscowRudnNovember10 from "@/data-sources/russia/moscow-rudn-enrichment-2026-11-10.json";
import allHseArchive from "@/data-sources/release/2026-12/evidence/2026-11-16-hse-results-all.json";
import hseCampusServices from "@/data-sources/release/2026-12/evidence/2026-11-16-hse-campus-services.json";
import educationPathways from "@/data-sources/release/2026-12/evidence/2026-11-18-education-pathways.json";
import reaCollegeNovember18 from "@/data-sources/russia/rea-mpek-college-enrichment-2026-11-18.json";
import catalogFillNovember20 from "@/data-sources/russia/fill-2026-11-20.json";
import catalogFillNovember21 from "@/data-sources/russia/fill-2026-11-21.json";
import catalogFillNovember22 from "@/data-sources/russia/fill-2026-11-22.json";
import catalogFillNovember23 from "@/data-sources/russia/fill-2026-11-23.json";
import catalogFillNovember25 from "@/data-sources/russia/fill-2026-11-25.json";
import { hsePostgraduateOfferings } from "@/lib/hse-postgraduate-admissions";
import { hseMasterTuition } from "@/lib/hse-admissions";
import type { HseAdmissionResources } from "@/lib/hse-admission-resources";
import type { AdvancedEducationTrack } from "@/lib/education-pathways";

import {
  mergeDirectoryEnrichment,
  type DirectoryDetails,
  type DirectoryEnrichment,
} from "@/lib/directory/model";

export * from "@/lib/directory/model";

export const directoryDetails = mergeDirectoryEnrichment(
  [...snapshot.profiles, ...regionalSnapshot.profiles] as DirectoryDetails[],
  [
    ...enrichment.profiles,
    ...regionalEnrichment.profiles,
    ...regionalEnrichmentOctober10.profiles,
    ...moscowEnrichmentOctober10.profiles,
    ...moscowEnrichmentOctober11.profiles,
    ...regionalEnrichmentOctober11.profiles,
    ...moscowEnrichmentOctober20.profiles,
    ...regionalNorthEnrichmentOctober20.profiles,
    ...regionalSouthEnrichmentOctober20.profiles,
    ...moscowEnrichmentOctober22.profiles,
    ...regionalEnrichmentOctober22.profiles,
    ...contactsEnrichmentOctober22.profiles,
    ...regionalEducationOctober25.profiles,
    ...regionalStructureOctober25.profiles,
    ...contactsEnrichmentOctober25.profiles,
    ...coreEnrichmentNovember9.profiles,
    ...moscowEnrichmentNovember9.profiles,
    ...southEastEnrichmentNovember9.profiles,
    ...uralNsuEnrichmentNovember9.profiles,
    ...continuationEducationNovember9.profiles,
    ...continuationContactsNovember9.profiles,
    ...continuationStructureNovember9.profiles,
    ...followupRegionalEducationNovember9.profiles,
    ...followupCentralEducationNovember9.profiles,
    ...followupContactsNovember9.profiles,
    ...moscowOverviewNovember10.profiles,
    ...moscowHseNovember10.profiles,
    ...hseFullEducationNovember16.profiles,
    ...hseAdditionalEducationNovember18.profiles,
    { universitySlug: "hse", offerings: hsePostgraduateOfferings },
    ...reaCollegeNovember18.profiles,
    ...moscowMiptNovember10.profiles,
    ...moscowMisisNovember10.profiles,
    ...moscowRudnNovember10.profiles,
    ...catalogFillNovember20.profiles,
    ...catalogFillNovember21.profiles,
    ...catalogFillNovember22.profiles,
    ...catalogFillNovember23.profiles,
    ...catalogFillNovember25.profiles,
  ] as DirectoryEnrichment[],
).map((profile) =>
  profile.universitySlug === "hse"
    ? {
        ...profile,
        admissionResources: {
          masterTuition: structuredClone(hseMasterTuition),
          archive: structuredClone(
            allHseArchive,
          ) as HseAdmissionResources["archive"],
          services: structuredClone(hseCampusServices),
          pathways: educationPathways.contexts.map((context) => ({
            key: context.key as AdvancedEducationTrack,
            title: `ВШЭ · ${context.title}`,
            priorEducation: context.priorEducation,
            admissionBasis: context.admissionBasis,
            dates: context.dates
              .filter((date) => date.year !== null)
              .map((date) => ({ label: date.label, year: date.year! })),
            notes: context.notes.filter((note) => !note.includes("HTTP 403")),
            sources: structuredClone(context.sources),
          })),
        },
      }
    : profile,
);
const bySlug = new Map(
  directoryDetails.map((profile) => [profile.universitySlug, profile]),
);

export function getDirectoryDetails(
  slug: string,
): DirectoryDetails | undefined {
  return bySlug.get(slug);
}

export const directoryOfferingCount = directoryDetails.reduce(
  (total, profile) => total + profile.offerings.length,
  0,
);
