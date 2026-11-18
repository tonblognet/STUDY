import { describe, expect, it } from "vitest";
import type { HseAdmissionResources } from "@/lib/hse-admission-resources";
import { mergeDirectoryEnrichment } from "@/lib/university-directory-details";
import { mergeUniversity } from "@/scripts/catalog";
import { baselineCatalog } from "./baseline";
import { catalogChecksum, catalogDiff } from "./diff";
import { parseCatalog } from "./schema";

const repository = baselineCatalog();

function scopedCatalog(...slugs: string[]) {
  const scope = new Set(slugs);
  return structuredClone({
    ...repository,
    programs: repository.programs.filter((row) =>
      scope.has(row.universitySlug),
    ),
    universities: repository.universities.filter((row) => scope.has(row.slug)),
    universityFacts: repository.universityFacts.filter((row) =>
      scope.has(row.universitySlug),
    ),
    directoryDetails: repository.directoryDetails.filter((row) =>
      scope.has(row.universitySlug),
    ),
    admissionCampaigns: repository.admissionCampaigns.filter((row) =>
      scope.has(row.universitySlug),
    ),
  });
}

describe("versioned HSE admission resources", () => {
  it("keeps an older publication unchanged until a scoped catalog import replaces its resources", () => {
    const published = scopedCatalog("hse", "sfi");
    const hse = published.directoryDetails.find(
      (row) => row.universitySlug === "hse",
    )!;
    delete hse.admissionResources;
    const oldRevision = parseCatalog(published);
    expect(
      oldRevision.directoryDetails.find((row) => row.universitySlug === "hse")!
        .admissionResources,
    ).toBeUndefined();
    const oldChecksum = catalogChecksum(oldRevision);
    const imported = mergeUniversity(oldRevision, scopedCatalog("hse"), "hse");
    const resources = imported.directoryDetails.find(
      (row) => row.universitySlug === "hse",
    )!.admissionResources!;
    expect(resources.archive.records.length).toBeGreaterThan(600);
    expect(resources.masterTuition.length).toBeGreaterThan(0);
    expect(resources.services.campusAdmissionDeadlines).toHaveLength(4);
    expect(catalogDiff(oldRevision, imported)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "directoryDetails.hse.admissionResources",
          before: null,
        }),
      ]),
    );
    expect(
      imported.directoryDetails.filter((row) => row.universitySlug !== "hse"),
    ).toEqual(
      oldRevision.directoryDetails.filter(
        (row) => row.universitySlug !== "hse",
      ),
    );
    resources.masterTuition[0].tuition.value = 1;
    expect(catalogChecksum(oldRevision)).toBe(oldChecksum);
    expect(
      baselineCatalog().directoryDetails.find(
        (row) => row.universitySlug === "hse",
      )!.admissionResources!.masterTuition[0].tuition.value,
    ).not.toBe(1);
  });

  it("publishes the profile and all resource changes together without changing either input revision", () => {
    const oldPayload = scopedCatalog("hse", "sfi");
    const candidate = scopedCatalog("hse");
    // The preceding test checks the full evidence bundle. Keep these independent
    // revision/diff/checksum assertions focused on one fact from each resource.
    for (const snapshot of [oldPayload, candidate]) {
      snapshot.programs = [];
      for (const details of snapshot.directoryDetails) {
        details.offerings = details.offerings.slice(0, 1);
        if (details.admissionResources) {
          details.admissionResources.masterTuition =
            details.admissionResources.masterTuition.slice(0, 1);
          details.admissionResources.archive.records =
            details.admissionResources.archive.records.slice(0, 1);
        }
      }
    }
    const publishedHse = oldPayload.directoryDetails.find(
      (row) => row.universitySlug === "hse",
    )!;
    publishedHse.admissionResources!.masterTuition[0].tuition.value = 100;
    publishedHse.admissionResources!.archive.records[0].title =
      "Прежний конкурс";
    publishedHse.admissionResources!.services.housing[0].notes =
      "Прежние условия";
    const published = parseCatalog(JSON.parse(JSON.stringify(oldPayload)));
    const publishedChecksum = catalogChecksum(published);
    candidate.directoryDetails[0].fields.overview!.value =
      "Обновлённый профиль ВШЭ";
    const candidateChecksum = catalogChecksum(candidate);
    const imported = mergeUniversity(published, candidate, "hse");
    const importedHse = imported.directoryDetails.find(
      (row) => row.universitySlug === "hse",
    )!;
    expect(importedHse).toEqual(candidate.directoryDetails[0]);
    expect(
      catalogDiff(published, imported).map((change) => change.path),
    ).toEqual(
      expect.arrayContaining([
        "directoryDetails.hse.fields.overview",
        "directoryDetails.hse.admissionResources.masterTuition",
        "directoryDetails.hse.admissionResources.archive.records",
        "directoryDetails.hse.admissionResources.services.housing",
      ]),
    );
    // This is the same JSON payload contract used for immutable DB publications.
    const reloaded = parseCatalog(JSON.parse(JSON.stringify(imported)));
    expect(catalogChecksum(reloaded)).toBe(catalogChecksum(imported));
    importedHse.admissionResources!.archive.records[0].title =
      "Локальная правка";
    importedHse.admissionResources!.services.housing[0].notes =
      "Локальная правка";
    expect(catalogChecksum(published)).toBe(publishedChecksum);
    expect(catalogChecksum(candidate)).toBe(candidateChecksum);
  });

  it("preserves legacy published codes and source metadata without rewriting their identity", () => {
    const candidate = scopedCatalog("hse");
    const resources = candidate.directoryDetails[0].admissionResources!;
    resources.archive.records[0].code = "230100";
    resources.archive.records[0].codes = ["230100"];
    Object.assign(resources.archive.sources["centralMoscowResults2025"], {
      resolvedUrl: "https://ba.hse.ru/data/2013/Отчет 2013.pdf",
    });
    Object.assign(resources.archive.records[0], {
      identityCandidates2026: [
        {
          title: "Исторический конкурс без автоматического сопоставления",
          codes: ["Н-17"],
          programUrls: ["https://ba.hse.ru/previous"],
          identitySource: "centralMoscowResults2025",
          identityRowIndexZeroBased: 0,
        },
      ],
    });
    expect(
      parseCatalog(candidate).directoryDetails[0].admissionResources,
    ).toEqual(resources);
  });

  it.each<{
    name: string;
    mutate: (resources: HseAdmissionResources) => void;
  }>([
    {
      name: "master fact URL",
      mutate: (resources) => {
        resources.masterTuition[0].tuition.sourceUrl =
          "https://evil.example/tuition";
      },
    },
    {
      name: "archive source hostname",
      mutate: (resources) => {
        Object.values(resources.archive.sources)[0].url =
          "https://hse.ru.evil.example/results";
      },
    },
    {
      name: "program URL credentials",
      mutate: (resources) => {
        resources.archive.records[0].programUrls = [
          "https://editor:secret@hse.ru/program",
        ];
      },
    },
    {
      name: "resolved archival source URL",
      mutate: (resources) => {
        Object.assign(Object.values(resources.archive.sources)[0], {
          resolvedUrl: "https://evil.example/results",
        });
      },
    },
    {
      name: "archival identity candidate URL",
      mutate: (resources) => {
        Object.assign(resources.archive.records[0], {
          identityCandidates2026: [
            {
              title: "Программа",
              codes: ["01.03.02"],
              programUrls: ["https://evil.example/program"],
              identitySource: "centralMoscowResults2025",
              identityRowIndexZeroBased: 0,
            },
          ],
        });
      },
    },
    {
      name: "excluded source metadata URL",
      mutate: (resources) => {
        Object.assign(resources.archive, {
          excludedSources: [
            {
              source: { url: "https://evil.example/old-results" },
              reasonRu: "Исторический документ",
            },
          ],
        });
      },
    },
    {
      name: "housing rules URL",
      mutate: (resources) => {
        resources.services.housing[0].allocationRulesUrl =
          "javascript:alert(1)";
      },
    },
    {
      name: "military URL",
      mutate: (resources) => {
        resources.services.militaryTraining[0].admissionUrl =
          "https://evil.example/admission";
      },
    },
  ])("rejects an untrusted $name inside an import", ({ mutate }) => {
    const candidate = scopedCatalog("hse");
    mutate(candidate.directoryDetails[0].admissionResources!);
    expect(() => parseCatalog(candidate)).toThrow(/источник|HTTP|URL|url/i);
  });

  it("rejects dangling sources, missing campus services and unsupported numeric states", () => {
    const dangling = scopedCatalog("hse");
    dangling.directoryDetails[0].admissionResources!.archive.records[0].source =
      "missing-source";
    expect(() => parseCatalog(dangling)).toThrow(/Источник не найден/);
    const danglingMetadata = scopedCatalog("hse");
    Object.assign(
      danglingMetadata.directoryDetails[0].admissionResources!.archive
        .records[0],
      {
        supportingSources: [{ source: "missing-source", locator: "стр. 1" }],
      },
    );
    expect(() => parseCatalog(danglingMetadata)).toThrow(/Источник не найден/);
    const invalidMetadata = scopedCatalog("hse");
    Object.assign(
      invalidMetadata.directoryDetails[0].admissionResources!.archive,
      {
        historicalArchive: { summary: { records: Infinity } },
      },
    );
    expect(() => parseCatalog(invalidMetadata)).toThrow(/конечным/);
    const missingHousing = scopedCatalog("hse");
    missingHousing.directoryDetails[0].admissionResources!.services.housing =
      [];
    expect(() => parseCatalog(missingHousing)).toThrow(
      /Нет сведений для кампуса/,
    );
    const missingCampus = scopedCatalog("hse");
    const services =
      missingCampus.directoryDetails[0].admissionResources!.services;
    services.campusAdmissionDeadlines =
      services.campusAdmissionDeadlines.slice(1);
    services.housing = services.housing.slice(1);
    services.militaryTraining = services.militaryTraining.slice(1);
    expect(() => parseCatalog(missingCampus)).toThrow(
      /Нет сведений для кампуса/,
    );
    const price = scopedCatalog("hse");
    price.directoryDetails[0].admissionResources!.masterTuition[0].tuition.value =
      -1;
    expect(() => parseCatalog(price)).toThrow();
    const fractionalPlaces = scopedCatalog("hse");
    fractionalPlaces.directoryDetails[0].admissionResources!.masterTuition[0].budgetPlaces.value = 1.5;
    expect(() => parseCatalog(fractionalPlaces)).toThrow();
    const score = scopedCatalog("hse");
    score.directoryDetails[0].admissionResources!.archive.records[0].budget = {
      value: 300,
      status: "unknown",
      noteRu: "Число требует проверки",
    };
    expect(() => parseCatalog(score)).toThrow(/должен быть null/);
    const campus = scopedCatalog("hse");
    campus.directoryDetails[0].admissionResources!.services.campusAdmissionDeadlines[0].campusName =
      "Неизвестный кампус";
    expect(() => parseCatalog(campus)).toThrow();
    const otherUniversity = scopedCatalog("hse", "sfi");
    otherUniversity.directoryDetails.find(
      (row) => row.universitySlug === "sfi",
    )!.admissionResources = otherUniversity.directoryDetails.find(
      (row) => row.universitySlug === "hse",
    )!.admissionResources;
    expect(() => parseCatalog(otherUniversity)).toThrow(/только к профилю hse/);
  });

  it("carries an optional exact published price without assuming an annual period", () => {
    const candidate = scopedCatalog("hse");
    const offering = candidate.directoryDetails[0].offerings[0];
    const sourceUrl = offering.sourceUrl;
    offering.publishedPrice = {
      amount: 147000.5,
      currency: "₽",
      period: "за курс",
    };
    const parsed = parseCatalog(candidate).directoryDetails[0].offerings[0];
    expect(parsed.publishedPrice).toEqual(offering.publishedPrice);
    expect(parsed.sourceUrl).toBe(sourceUrl);
    const enriched = mergeDirectoryEnrichment(
      [{ ...candidate.directoryDetails[0], offerings: [offering] }],
      [
        {
          universitySlug: "hse",
          offerings: [
            {
              ...offering,
              id: "another-billing-period",
              publishedPrice: {
                ...offering.publishedPrice,
                period: "за месяц",
              },
            },
          ],
        },
      ],
    );
    expect(enriched[0].offerings).toHaveLength(2);
    offering.publishedPrice.period = null;
    expect(
      parseCatalog(candidate).directoryDetails[0].offerings[0].publishedPrice!
        .period,
    ).toBeNull();
    for (const price of [
      { amount: -1, currency: "₽", period: null },
      { amount: Infinity, currency: "₽", period: null },
      { amount: NaN, currency: "₽", period: null },
      { amount: 1, currency: " ", period: null },
    ]) {
      offering.publishedPrice = price;
      expect(() => parseCatalog(candidate)).toThrow();
    }
    delete offering.publishedPrice;
    expect(
      parseCatalog(candidate).directoryDetails[0].offerings[0].publishedPrice,
    ).toBeUndefined();
  });
});
