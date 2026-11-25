import { describe, expect, it } from "vitest";
import { programs, universities } from "./data";
import {
  directoryDetails,
  directoryEvidenceSummary,
  getDirectoryDetails,
  mergeDirectoryEnrichment,
  type DirectoryEnrichment,
} from "./university-directory-details";
import { universityFactProfiles } from "./university-facts";
import originalProfiles from "@/data-sources/moscow/profiles.json";
import moscowOctober20 from "@/data-sources/russia/moscow-enrichment-2026-10-20.json";
import catalogFillNovember25 from "@/data-sources/russia/fill-2026-11-25.json";
import northOctober20 from "@/data-sources/russia/regional-north-enrichment-2026-10-20.json";
import southOctober20 from "@/data-sources/russia/regional-south-enrichment-2026-10-20.json";
import moscowOctober22 from "@/data-sources/russia/moscow-enrichment-2026-10-22.json";
import regionalOctober22 from "@/data-sources/russia/regional-enrichment-2026-10-22.json";
import contactsOctober22 from "@/data-sources/russia/contacts-enrichment-2026-10-22.json";
import regionalEducationOctober25 from "@/data-sources/russia/regional-education-enrichment-2026-10-25.json";
import regionalStructureOctober25 from "@/data-sources/russia/regional-structure-enrichment-2026-10-25.json";
import contactsOctober25 from "@/data-sources/russia/contacts-enrichment-2026-10-25.json";
import coreNovember9 from "@/data-sources/russia/core-enrichment-2026-11-09.json";
import moscowNovember9 from "@/data-sources/russia/moscow-priority-enrichment-2026-11-09.json";
import southEastNovember9 from "@/data-sources/russia/south-east-enrichment-2026-11-09.json";
import uralNsuNovember9 from "@/data-sources/russia/ural-nsu-enrichment-2026-11-09.json";
import continuationEducationNovember9 from "@/data-sources/russia/continuation-education-2026-11-09.json";
import continuationContactsNovember9 from "@/data-sources/russia/continuation-contacts-2026-11-09.json";
import continuationStructureNovember9 from "@/data-sources/russia/continuation-structure-2026-11-09.json";
import followupRegionalEducationNovember9 from "@/data-sources/russia/followup-regional-education-2026-11-09.json";
import followupCentralEducationNovember9 from "@/data-sources/russia/followup-central-education-2026-11-09.json";
import followupContactsNovember9 from "@/data-sources/russia/followup-contacts-2026-11-09.json";
import moscowHseNovember10 from "@/data-sources/russia/moscow-hse-enrichment-2026-11-10.json";

import overviewSourceReview from "@/data-sources/release/2026-12/evidence/2026-11-10-source-review.json";

describe("official university profile evidence", () => {
  it("fills the Moscow HSE card with sourced facts scoped to their published purpose", () => {
    const profile = getDirectoryDetails("hse")!;
    expect(profile.fields).toMatchObject(
      moscowHseNovember10.profiles[0].fields,
    );
    expect(profile.fields.overview?.value).toContain("№ 917");
    expect(profile.fields.hostelInfo?.value).toContain(
      "поступивших в 2026 году на первый курс",
    );
    expect(profile.fields.admissionsPhone?.value).toBe(
      "+7 (495) 771-32-42; +7 (495) 916-88-44",
    );
    expect(profile.fields.admissionsEmail?.value).toBe("abitur@hse.ru");
    expect(profile.faculties).toHaveLength(69);
    expect(profile.offerings).toHaveLength(1490);
    expect(
      profile.offerings.filter((row) => row.sourceYear === null),
    ).toHaveLength(1439);
    expect(
      profile.offerings.filter((row) => row.sourceYear === 2026),
    ).toHaveLength(51);
  });

  it("keeps the HSE lyceum cohorts as sourced education listings", () => {
    const offerings = getDirectoryDetails("hse")!.offerings.filter((row) =>
      row.sourceSection?.includes("Лицей; /html/"),
    );
    expect(offerings).toHaveLength(27);
    expect(offerings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Востоковедение 11 класс (набор 2023 года)",
          level: "Среднее общее образование",
          admissionsStatus: "pending_review",
          sourceYear: null,
          sourceSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        }),
      ]),
    );
  });

  it("loads the undated MSU education inventory separately from admissions", () => {
    const profile = getDirectoryDetails("mgu")!;
    expect(profile.fields.regDate?.value).toBe("25 января 1755 года");
    expect(profile.offerings).toHaveLength(166);
    expect(
      profile.offerings.every(
        (row) =>
          row.sourceYear === null &&
          row.admissionsStatus === "pending_review" &&
          row.sourceUrl === "https://msu.ru/sveden/education/sd.pdf",
      ),
    ).toBe(true);
  });

  it("preserves the reviewed official overview and its exact snapshot provenance", () => {
    const sources = overviewSourceReview.sources;
    expect(overviewSourceReview.universities.map((row) => row.slug)).toEqual([
      "mpei",
      "mephi",
    ]);
    for (const row of overviewSourceReview.universities) {
      const candidate = row.sections.general_information.overviewCandidate;
      const source = sources[candidate.source as keyof typeof sources];
      expect(getDirectoryDetails(row.slug)?.fields.overview).toEqual({
        value: candidate.value,
        sourceUrl: source.finalUrl,
        sourceYear: Number(source.retrievedAtUtc.slice(0, 4)),
        checkedAt: candidate.sourceComparedAtUtc,
        sourceSha256: source.sha256,
      });
    }
  });

  it("publishes continuation evidence idempotently while keeping education lists outside admission matching", () => {
    const additions = [
      ...continuationEducationNovember9.profiles,
      ...continuationContactsNovember9.profiles,
      ...continuationStructureNovember9.profiles,
      ...followupRegionalEducationNovember9.profiles,
      ...followupCentralEducationNovember9.profiles,
      ...followupContactsNovember9.profiles,
    ] as DirectoryEnrichment[];
    const contests = new Set(programs.map((row) => row.id));
    for (const addition of additions) {
      const current = getDirectoryDetails(addition.universitySlug)!;
      expect(current).toBeDefined();
      for (const [key, field] of Object.entries(addition.fields ?? {}))
        expect(current.fields[key as keyof typeof current.fields]).toEqual(
          field,
        );
      for (const faculty of addition.faculties ?? [])
        expect(current.faculties).toContainEqual(faculty);
      for (const offering of addition.offerings ?? []) {
        expect(current.offerings).toContainEqual(offering);
        expect(offering.admissionsStatus).toBe("pending_review");
        expect(offering.sourceYear).toBeNull();
        expect(contests.has(offering.id)).toBe(false);
      }
      const facts = [
        ...Object.values(addition.fields ?? {}),
        ...(addition.faculties ?? []),
        ...(addition.offerings ?? []),
      ];
      for (const fact of facts) {
        expect(fact.sourceUrl).toMatch(/^https:\/\//);
        expect(fact.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
        expect(fact.checkedAt).toMatch(/^2026-11-09T/);
      }
    }
    expect(mergeDirectoryEnrichment(directoryDetails, additions)).toEqual(
      directoryDetails,
    );
  });

  it("exposes each November 9 fact with its source and keeps the new listings outside the matcher", () => {
    const additions: DirectoryEnrichment[] = [
      ...coreNovember9.profiles,
      ...moscowNovember9.profiles,
      ...southEastNovember9.profiles,
      ...uralNsuNovember9.profiles,
    ];
    expect(new Set(additions.map((row) => row.universitySlug)).size).toBe(12);
    const contestIds = new Set(programs.map((row) => row.id));
    for (const addition of additions) {
      const current = getDirectoryDetails(addition.universitySlug)!;
      for (const [key, field] of Object.entries(addition.fields ?? {}))
        expect(current.fields[key as keyof typeof current.fields]).toEqual(
          field,
        );
      for (const unit of addition.faculties ?? [])
        expect(current.faculties).toContainEqual(unit);
      for (const offering of addition.offerings ?? []) {
        expect(current.offerings).toContainEqual(offering);
        expect(offering.admissionsStatus).toBe("pending_review");
        expect(offering.sourceYear).toBe(
          addition.universitySlug === "mephi" ? 2026 : null,
        );
        expect(contestIds.has(offering.id)).toBe(false);
      }
      const facts = [
        ...Object.values(addition.fields ?? {}),
        ...(addition.faculties ?? []),
        ...(addition.offerings ?? []),
      ];
      for (const fact of facts) {
        expect(fact.sourceUrl).toMatch(/^https:\/\//);
        expect(fact.checkedAt).toMatch(/^2026-11-09T/);
        expect(fact.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
      }
    }
    expect(getDirectoryDetails("russia-1638")!.offerings).toHaveLength(81);
    expect(
      getDirectoryDetails("russia-1638")!
        .offerings.map((row) => row.profile)
        .join(" "),
    ).not.toMatch(/Тарский филиал/iu);
    expect(getDirectoryDetails("russia-199")!.faculties).toHaveLength(11);
    expect(getDirectoryDetails("mipt")!.fields.admissionsPhone).toBeDefined();
    expect(
      getDirectoryDetails("mephi")!.offerings.filter((row) =>
        row.checkedAt.startsWith("2026-11-09T"),
      ),
    ).toHaveLength(77);
  });

  it("retains October 25 evidence without turning cohort labels or ambiguous source values into admissions facts", () => {
    const additions: Array<Required<DirectoryEnrichment>> = [
      ...regionalEducationOctober25.profiles,
      ...regionalStructureOctober25.profiles,
      ...contactsOctober25.profiles,
    ];
    expect(additions.flatMap((row) => row.offerings)).toHaveLength(961);
    expect(additions.flatMap((row) => row.faculties)).toHaveLength(78);
    expect(additions.flatMap((row) => Object.keys(row.fields))).toHaveLength(
      63,
    );
    expect(
      new Set(
        additions
          .filter(
            (row) =>
              row.offerings.length ||
              row.faculties.length ||
              Object.keys(row.fields).length,
          )
          .map((row) => row.universitySlug),
      ).size,
    ).toBe(21);
    for (const addition of additions) {
      const current = getDirectoryDetails(addition.universitySlug)!;
      for (const [key, field] of Object.entries(addition.fields))
        expect(current.fields[key as keyof typeof current.fields]).toEqual(
          field,
        );
      for (const faculty of addition.faculties)
        expect(current.faculties).toContainEqual(faculty);
      for (const offering of addition.offerings) {
        expect(current.offerings).toContainEqual(offering);
        expect(offering.sourceYear).toBeNull();
        expect(offering.admissionsStatus).toBe("pending_review");
        expect(offering.checkedAt).toMatch(/^2026-10-25T/);
        expect(offering.forms).not.toBe("очнаz");
        expect(offering.level).not.toMatch(/магистр/iu);
      }
    }
    const pnipu = regionalEducationOctober25.profiles.find(
      (row) => row.universitySlug === "russia-197",
    )!.offerings;
    expect(pnipu).toHaveLength(155);
    expect(
      pnipu.every((row) => row.profile === null && row.duration === null),
    ).toBe(true);
    expect(
      regionalEducationOctober25.issues.filter(
        (row) => row.kind === "source_level_conflict",
      ),
    ).toHaveLength(87);
    expect(
      contactsOctober25.profiles.find((row) => row.universitySlug === "mipt")
        ?.fields,
    ).not.toHaveProperty("admissionsPhone");
    expect(getDirectoryDetails("mgppu")!.fields.hostelInfo?.value).toMatch(
      /^ФГБОУ ВО МГППУ не имеет общежития\./u,
    );
    expect(
      regionalStructureOctober25.profiles.find(
        (row) => row.universitySlug === "russia-199",
      )?.faculties ?? [],
    ).toHaveLength(0);
  });
  it("retains every reviewed October 22 fact and leaves unconfirmed intake and durations unknown", () => {
    const additions: Array<Required<DirectoryEnrichment>> = [
      ...moscowOctober22.profiles,
      ...regionalOctober22.profiles,
      ...contactsOctober22.profiles,
    ];
    expect(
      new Set(
        additions
          .filter(
            (row) =>
              row.offerings.length ||
              row.faculties.length ||
              Object.keys(row.fields).length,
          )
          .map((row) => row.universitySlug),
      ).size,
    ).toBe(24);
    expect(additions.flatMap((row) => row.offerings)).toHaveLength(1118);
    expect(additions.flatMap((row) => row.faculties)).toHaveLength(177);
    expect(additions.flatMap((row) => Object.keys(row.fields))).toHaveLength(
      90,
    );
    for (const addition of additions) {
      const current = getDirectoryDetails(addition.universitySlug)!;
      for (const [key, field] of Object.entries(addition.fields))
        expect(current.fields[key as keyof typeof current.fields]).toEqual(
          field,
        );
      for (const faculty of addition.faculties)
        expect(current.faculties).toContainEqual(faculty);
      for (const offering of addition.offerings) {
        expect(current.offerings).toContainEqual(offering);
        expect(offering.sourceYear).toBeNull();
        expect(offering.admissionsStatus).toBe("pending_review");
        expect(offering.checkedAt).toMatch(/^2026-10-22T/);
      }
    }
    const nonFullTimeOgu = regionalOctober22.profiles
      .find((row) => row.universitySlug === "russia-187")!
      .offerings.filter(
        (row) => row.forms?.toLocaleLowerCase("ru") !== "очная",
      );
    expect(nonFullTimeOgu).toHaveLength(52);
    expect(nonFullTimeOgu.every((row) => row.duration === null)).toBe(true);
    const distinctIzhgtuProfile = getDirectoryDetails(
      "russia-79",
    )!.offerings.find(
      (row) => row.id === "russia-79-official-c76e00fefd2bac3b",
    )!;
    expect(distinctIzhgtuProfile.profile).toBe("Технология машиностроения");
    expect(distinctIzhgtuProfile.duration).toBe("4 года");
    expect(
      moscowOctober22.profiles
        .find((row) => row.universitySlug === "rsuh")!
        .offerings.filter(
          (row) =>
            row.code === "38.05.01" &&
            row.profile ===
              "Экономическая безопасность хозяйствующего субъекта" &&
            row.forms?.toLocaleLowerCase("ru") === "очная",
        ),
    ).toHaveLength(0);
    expect(moscowOctober22.collectionIssues).toContainEqual(
      expect.objectContaining({
        universitySlug: "rsuh",
        kind: "source_level_conflict",
        code: "38.05.01",
      }),
    );
  });

  it("adds RSUH full-time economic security after the official inventory resolved the degree conflict", () => {
    const rows = getDirectoryDetails("rsuh")!.offerings.filter(
      (row) =>
        row.code === "38.05.01" &&
        row.profile === "Экономическая безопасность хозяйствующего субъекта",
    );
    expect(
      rows.map((row) => row.forms?.toLocaleLowerCase("ru")).sort(),
    ).toEqual(["заочная", "очная"]);
    expect(
      rows.find((row) => row.forms?.toLocaleLowerCase("ru") === "очная"),
    ).toMatchObject({
      level: "Высшее образование - специалитет",
      duration: "5 лет",
      sourceUrl: "https://www.rsuh.ru/sveden/education/",
      sourceYear: null,
      admissionsStatus: "pending_review",
    });
  });
  it("retains every reviewed October 20 gap fact with its own evidence and unknown intake", () => {
    const additions: Array<Required<DirectoryEnrichment>> = [
      ...moscowOctober20.profiles,
      ...northOctober20.profiles,
      ...southOctober20.profiles,
    ];
    expect(additions.flatMap((row) => row.offerings)).toHaveLength(507);
    expect(additions.flatMap((row) => row.faculties)).toHaveLength(56);
    expect(additions.flatMap((row) => Object.keys(row.fields))).toHaveLength(
      34,
    );
    for (const addition of additions) {
      const current = getDirectoryDetails(addition.universitySlug)!;
      for (const [key, field] of Object.entries(addition.fields))
        expect(current.fields[key as keyof typeof current.fields]).toEqual(
          field,
        );
      for (const faculty of addition.faculties)
        expect(current.faculties).toContainEqual(faculty);
      for (const offering of addition.offerings) {
        expect(current.offerings).toContainEqual(offering);
        expect(offering.sourceYear).toBeNull();
        expect(offering.admissionsStatus).toBe("pending_review");
        expect(offering.checkedAt).toMatch(/^2026-10-20T/);
      }
    }
    const ambiguousDuration = getDirectoryDetails("mfua")!.offerings.find(
      (row) => row.id === "mfua-official-079ede35d2bdf3f7",
    )!;
    expect(ambiguousDuration.profile).toBe("Дизайн среды");
    expect(ambiguousDuration.duration).toBeNull();
    expect(moscowOctober20.collectionIssues).toContainEqual(
      expect.objectContaining({
        universitySlug: "mfua",
        kind: "duration_missing_unit",
        publishedDuration: "4",
      }),
    );
  });
  it("fills gaps idempotently while retaining earlier approved facts and unknown admissions", () => {
    const original = getDirectoryDetails("sfi")!;
    const faculty = {
      name: "Исторический факультет",
      url: null,
      sourceUrl: "https://sfi.ru/about/sveden/struct.html",
      sourceYear: 2026,
      checkedAt: "2026-10-09T12:00:00Z",
      sourceSha256: "a".repeat(64),
    };
    const addition = {
      universitySlug: "sfi",
      fields: {
        fullName: {
          ...original.fields.fullName!,
          value: "Unapproved replacement",
        },
        overview: {
          ...original.fields.fullName!,
          value: "New sourced overview",
        },
      },
      faculties: [faculty, faculty],
    };
    const merged = mergeDirectoryEnrichment([original], [addition]);
    expect(merged[0].fields.fullName).toEqual(original.fields.fullName);
    expect(merged[0].fields.overview?.value).toBe(
      original.fields.overview?.value ?? "New sourced overview",
    );
    expect(
      merged[0].faculties?.filter((row) => row.name === faculty.name),
    ).toHaveLength(1);
    expect(mergeDirectoryEnrichment(merged, [addition])).toEqual(merged);
    expect(merged[0].offerings).toEqual(original.offerings);
    expect(merged[0].licenseRegistry).toEqual(original.licenseRegistry);
    expect(() =>
      mergeDirectoryEnrichment([original], [{ universitySlug: "unknown" }]),
    ).toThrow(/Нет профиля/);
  });
  it("deduplicates repeated daily evidence while preserving distinct study forms and years", () => {
    const original = getDirectoryDetails("sfi")!;
    const faculty = {
      name: "Факультет  учёта",
      url: null,
      sourceUrl: "https://sfi.ru/about/sveden/struct.html",
      sourceYear: 2026,
      checkedAt: "2026-10-09T12:00:00Z",
      sourceSha256: "a".repeat(64),
    };
    const offering = {
      id: "first-fetch",
      code: "38.03.01",
      title: "Экономика",
      profile: "Учёт  и аудит",
      level: "Бакалавриат",
      forms: "Очная",
      duration: "4 года",
      admissionsStatus: "pending_review",
      sourceUrl: "https://sfi.ru/about/sveden/education.html",
      sourceYear: null,
      checkedAt: faculty.checkedAt,
      sourceSha256: faculty.sourceSha256,
    };
    const baseline = {
      ...original,
      faculties: [faculty],
      offerings: [offering],
    };
    const repeated = {
      ...offering,
      id: "second-fetch",
      title: " ЭКОНОМИКА ",
      profile: "Учет и аудит",
      checkedAt: "2026-10-10T12:00:00Z",
      sourceSha256: "b".repeat(64),
    };
    const merged = mergeDirectoryEnrichment(
      [baseline],
      [
        {
          universitySlug: original.universitySlug,
          faculties: [{ ...faculty, name: " ФАКУЛЬТЕТ учета " }],
          offerings: [
            repeated,
            { ...repeated, id: "other-form", forms: "Очно-заочная" },
            { ...repeated, id: "other-year", sourceYear: 2026 },
            { ...repeated, id: "other-section", sourceSection: "Кампус Б" },
            {
              ...repeated,
              id: "other-source",
              sourceUrl: "https://sfi.ru/branch/education.html",
            },
          ],
        },
      ],
    )[0];
    expect(merged.faculties).toEqual([faculty]);
    expect(merged.offerings.map((row) => row.id)).toEqual([
      "first-fetch",
      "other-form",
      "other-year",
      "other-section",
      "other-source",
    ]);
    expect(merged.offerings[0]).toEqual(offering);
    expect(baseline.offerings).toEqual([offering]);
  });
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
    const universitySlugs = new Set(universities.map((row) => row.slug));
    for (const profile of directoryDetails) {
      expect(universitySlugs.has(profile.universitySlug)).toBe(true);
      expect(new Set(profile.offerings.map((row) => row.id)).size).toBe(
        profile.offerings.length,
      );
      const invalidOfferings = profile.offerings.filter(
        (row) =>
          !row.code.trim() ||
          (row.sourceYear === null &&
            row.admissionsStatus !== "pending_review") ||
          ids.has(row.id) ||
          !/^https?:\/\//.test(row.sourceUrl) ||
          !/^[a-f0-9]{64}$/.test(row.sourceSha256 ?? ""),
      );
      expect(invalidOfferings, profile.universitySlug).toEqual([]);
    }
    // Employment statistics are not evidence of a current program offering.
    // The older fetch had only statistics for these two universities. New
    // implemented-program evidence may enrich them without rewriting that history.
    expect(
      originalProfiles.profiles.find((row) => row.universitySlug === "sechenov")
        ?.offerings,
    ).toEqual([]);
    expect(
      originalProfiles.profiles.find((row) => row.universitySlug === "fa")
        ?.offerings,
    ).toEqual([]);
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
    expect(getDirectoryDetails("guu")?.fields.hostelInfo?.value).toContain(
      "2 общежития",
    );
    expect(
      originalProfiles.profiles.find((row) => row.universitySlug === "mephi")
        ?.fields,
    ).not.toHaveProperty("hostelInfo");
    expect(getDirectoryDetails("mephi")?.fields.hostelInfo?.sourceUrl).toBe(
      "https://admission.mephi.ru/about/dorm",
    );
    expect(getDirectoryDetails("mephi")?.fields.hostelInfo?.value).toContain(
      "Университет имеет современный комплекс общежитий",
    );
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

  it("adds MIPT educational rows while keeping their admission year unknown", () => {
    const profile = getDirectoryDetails("mipt")!;
    expect(profile.faculties).toHaveLength(8);
    expect(profile.fields.overview?.value).toContain("1951 году");
    const originalOfferings = profile.offerings.filter(
      (row) =>
        row.sourceUrl === "https://mipt.ru/vikon/sveden/education/eduaccred/",
    );
    expect(originalOfferings).toHaveLength(207);
    expect(
      new Set(originalOfferings.map((row) => row.sourceSection)).size,
    ).toBe(5);
    for (const row of originalOfferings) {
      expect(row.sourceYear).toBeNull();
      expect(row.admissionsStatus).toBe("pending_review");
      expect(row.forms).toBe("Очная");
      expect(row.duration).toMatch(/^(?:2|4|5,5|6)$/);
    }
    const added = profile.offerings.filter(
      (row) => row.sourceUrl === "https://mipt.ru/sveden/education/eduaccred",
    );
    expect(added).toHaveLength(2);
    expect(added.every((row) => row.forms === "Очная")).toBe(true);
    expect(
      profile.offerings.some((row) => row.forms === "Не реализуется"),
    ).toBe(false);
  });

  it("loads the RUDN inventory across published levels without inferring admissions", () => {
    const profile = getDirectoryDetails("rudn")!;
    expect(profile.fields.overview?.value).toContain("5 февраля 1960 года");
    expect(profile.faculties).toHaveLength(17);
    expect(profile.offerings).toHaveLength(992);
    expect(profile.offerings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "01.04.02",
          profile: "Теория вероятностей и математическая статистика",
          level: "Высшее образование — специалитет, магистратура",
          forms: "Очная",
          duration: "2 года",
        }),
        expect.objectContaining({ code: "31.05.01", profile: "Лечебное дело" }),
        expect.objectContaining({ code: "1.1.1", duration: "4 года" }),
        expect.objectContaining({ code: "31.08.01", duration: "2 года" }),
      ]),
    );
    for (const row of profile.offerings) {
      expect(row.sourceYear).toBeNull();
      expect(row.admissionsStatus).toBe("pending_review");
      expect(row.sourceUrl).toBe(
        "https://www.rudn.ru/sveden/education/eduaccred/",
      );
    }
    expect(programs.find((entry) => entry.id === "rudn-ami")).toMatchObject({
      passingScore: null,
      passingScoreValue: { year: 2026, status: "pending_review" },
      passingHistory: [],
    });
  });

  it("fills MISIS card gaps without merging differently scoped education snapshots", () => {
    const profile = getDirectoryDetails("misis")!;
    expect(profile.fields.overview?.sourceUrl).toBe(
      "https://misis.ru/university/",
    );
    expect(profile.fields.hostelInfo?.sourceUrl).toBe(
      "https://misis.ru/applicants/accommodation/zaselenievobsh_ezhitiepervokusn/order/",
    );
    expect(profile.faculties).toHaveLength(10);
    expect(profile.offerings).toHaveLength(303);
  });

  it("separates admissions contacts, accommodation types and redirected hosting pages", () => {
    const institute = getDirectoryDetails("inpsycho")!;
    expect(institute.fields.admissionsEmail?.value).toBe("zayavka@inpsycho.ru");
    expect(institute.fields.admissionsPhone?.sourceUrl).toBe(
      "https://inpsycho.ru/sveden/common/",
    );
    expect(
      getDirectoryDetails("ippolitovka")?.fields.hostelInfo?.value,
    ).toContain("вузов-партнёров");
    expect(getDirectoryDetails("cms")?.fields.hostelInfo?.value).toContain(
      "0 общежитий и 1 интернат",
    );
    expect(getDirectoryDetails("shaninka")?.fields.telephone).toBeUndefined();
    for (const profile of directoryDetails)
      for (const field of Object.values(profile.fields))
        expect(new URL(field.sourceUrl).hostname).not.toBe("timeweb.com");
  });

  it("loads the November 21 official inventory without inferring admissions", () => {
    const profile = getDirectoryDetails("moscow-110271")!;
    expect(profile.offerings).toContainEqual(
      expect.objectContaining({
        code: "38.03.01",
        title: "Экономика",
        admissionsStatus: "pending_review",
        sourceYear: null,
        sourceUrl: "https://ineup.ru/sveden/education/eduaccred/",
        sourceSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });

  it("keeps the reviewed MEPhI educational inventory separate from admissions", () => {
    const added = getDirectoryDetails("mephi")!.offerings.filter((row) =>
      row.sourceUrl.startsWith("https://eis2.mephi.ru/programs"),
    );
    expect(added).toHaveLength(246);
    expect(
      added.every(
        (row) =>
          row.admissionsStatus === "pending_review" && row.sourceYear === null,
      ),
    ).toBe(true);
  });

  it("uses the Polytechnic housing conditions and self-evaluation report", () => {
    const { fields } = getDirectoryDetails("mospolytech")!;
    expect(fields.overview?.value).toContain("создан в 2016 году");
    expect(fields.overview?.sourceYear).toBe(2025);
    expect(fields.hostelInfo?.value).toContain("при наличии свободного");
    expect(fields.hostelInfo?.sourceYear).toBe(2026);
  });

  it("dates the Financial University housing places to the 2026 intake", () => {
    const { fields } = getDirectoryDetails("fa")!;
    expect(fields.overview?.sourceYear).toBe(2025);
    expect(fields.hostelInfo).toMatchObject({
      value: expect.stringContaining("1043 места"),
      sourceUrl: "https://www.fa.ru/university/dormitories/",
      sourceYear: 2026,
    });
  });

  it("retains the reviewed MGIMO listings with their original source years", () => {
    const profile = getDirectoryDetails("mgimo")!;
    expect(profile.fields.admissionsEmail?.value).toBe("priem@id.mgimo.ru");
    expect(profile.fields.telephone).toBeUndefined();
    expect(profile.faculties).toHaveLength(12);
    expect(profile.offerings).toHaveLength(93);
    expect(profile.offerings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "41.03.05",
          profile: "Большие данные и моделирование международных отношений",
          sourceYear: 2026,
          admissionsStatus: "pending_review",
        }),
        expect.objectContaining({
          code: "5.2.5",
          title: "Мировая экономика",
          sourceYear: 2023,
          admissionsStatus: "pending_review",
        }),
      ]),
    );
  });

  it("shows reviewed Bauman listings at their original source years", () => {
    const { fields, offerings } = getDirectoryDetails("bmstu")!;
    expect(fields.admissionsEmail?.value).toBe("abiturient@bmstu.ru");
    expect(fields.email).toMatchObject({
      value: "bauman@bmstu.ru",
      sourceYear: 2025,
    });
    expect(fields.hostelInfo?.value).toContain("на конкурсной основе");
    expect(offerings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "09.02.11",
          title: "Разработка и управление программным обеспечением",
          sourceYear: 2025,
          admissionsStatus: "pending_review",
        }),
        expect.objectContaining({
          code: "12.03.04",
          profile: "Биомедицинская инженерия 4.0",
          sourceYear: 2026,
          admissionsStatus: "pending_review",
        }),
      ]),
    );
  });

  it("adds the Pirogov admissions contact and academic institutes to the published list", () => {
    const { fields, faculties, offerings } = getDirectoryDetails("pirogov")!;
    expect(fields.admissionsEmail).toMatchObject({
      value: "prk@rsmu.ru",
      sourceUrl: "https://rsmu.ru/abitur/admission-office",
      sourceYear: 2026,
    });
    expect(faculties).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Институт материнства и детства",
          sourceUrl: "https://rsmu.ru/sveden/struct/",
        }),
      ]),
    );
    expect(offerings).toHaveLength(202);
  });

  it("uses the dated university document for the RSUH overview", () => {
    const { fields } = getDirectoryDetails("rsuh")!;
    expect(fields.overview).toMatchObject({
      value: expect.stringContaining("основан в 1991 году"),
      sourceYear: 2024,
      sourceUrl: expect.stringContaining("rsuh.ru/upload/main/science/2026/"),
    });
  });

  it("adds dated Gubkin profile facts without duplicating the offline listings", () => {
    const { fields, faculties, offerings } = getDirectoryDetails("gubkin")!;
    expect(fields.admissionsEmail).toMatchObject({
      value: "priem@gubkin.ru",
      sourceYear: 2026,
    });
    expect(fields.admissionsUrl?.value).toBe("https://priem.gubkin.ru/");
    expect(faculties).toHaveLength(13);
    expect(offerings).toHaveLength(209);
  });

  it("uses official admissions contacts and the dated MUCTR self-study", () => {
    const { fields } = getDirectoryDetails("muctr")!;
    expect(fields.admissionsPhone).toMatchObject({
      value: "+7-499-978-85-20",
      sourceYear: 2026,
    });
    expect(fields.admissionsEmail?.value).toBe("priem@muctr.ru");
    expect(fields.overview).toMatchObject({
      value: expect.stringContaining("в 1992 году"),
      sourceYear: 2024,
      sourceUrl: "https://www.muctr.ru/upload/sveden/files/002390.pdf",
    });
    expect(fields.admissionsUrl?.value).toBe(
      "https://www.muctr.ru/abitur/bachelor/pk/contact/",
    );
  });

  it("adds sourced Sechenov admissions contacts and history to the existing directory", () => {
    const { fields, offerings } = getDirectoryDetails("sechenov")!;
    expect(fields.admissionsPhone).toMatchObject({
      value: "+7 (495) 622-98-20",
      sourceYear: 2026,
      sourceUrl: "https://priem.sechenov.ru/undergraduate/pravila-priema/",
    });
    expect(fields.overview).toMatchObject({
      value: expect.stringContaining("с 1758 года"),
      sourceYear: 2021,
    });
    expect(offerings).toHaveLength(219);
  });

  it("adds the dated MSAL admissions contacts and the official education listings", () => {
    const { fields, faculties, offerings } = getDirectoryDetails("msal")!;
    expect(fields.admissionsPhone).toMatchObject({
      value: "8-800-555-7919",
      sourceYear: 2026,
    });
    expect(fields.overview?.value).toContain("с 1931 года");
    expect(faculties).toHaveLength(13);
    expect(offerings).toHaveLength(109);
    expect(offerings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "40.03.01",
          profile: "ИННОВАЦИОННАЯ ЮРИСПРУДЕНЦИЯ",
          admissionsStatus: "pending_review",
        }),
        expect.objectContaining({
          code: "5.1.5",
          level: "Аспирантура",
          sourceYear: 2026,
        }),
      ]),
    );
  });

  it("preserves MAI's published education levels and dated admissions contacts", () => {
    const { fields, faculties, offerings } = getDirectoryDetails("mai")!;
    expect(fields.admissionsPhone).toMatchObject({
      value: "+7 499 110-16-71",
      sourceYear: 2026,
    });
    expect(fields.admissionsEmail).toMatchObject({
      value: "priem@mai.ru",
      sourceYear: 2019,
    });
    expect(faculties).toHaveLength(5);
    expect(offerings).toHaveLength(108);
    expect(offerings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "01.03.02",
          profile: "Информатика",
          level: "Базовое высшее образование",
          sourceYear: 2026,
          admissionsStatus: "pending_review",
        }),
        expect.objectContaining({
          code: "1.1.7",
          level: "Аспирантура",
          sourceYear: 2026,
        }),
      ]),
    );
  });

  it("updates the existing MISIS system analysis program from its official card", () => {
    const misisPrograms = programs.filter(
      (program) => program.universitySlug === "misis",
    );
    expect(misisPrograms).toHaveLength(1);
    expect(misisPrograms[0]).toMatchObject({
      id: "misis-analysis",
      code: "27.03.03",
      faculty: "Институт компьютерных наук",
      passingScore: null,
      passingHistory: [],
    });
  });

  it("loads the RANEPA admissions contacts and reviewed Moscow institutes", () => {
    const { fields, faculties } = getDirectoryDetails("ranepa")!;
    expect(fields.admissionsEmail).toMatchObject({
      value: "pkranepa@ranepa.ru",
      sourceYear: 2026,
    });
    expect(fields.overview?.value).toContain("20 сентября 2010 года");
    expect(faculties).toHaveLength(5);
    expect(faculties).toContainEqual(
      expect.objectContaining({
        name: "Институт общественных наук",
        sourceYear: 2026,
      }),
    );
    expect(
      programs.find((entry) => entry.id === "ranepa-digital"),
    ).toMatchObject({
      budgetPlaces: 23,
      paidPlaces: 67,
      tuition: 475000,
      quotas: { general: { value: 17 }, target: { value: 0 } },
      passingScore: null,
    });
  });

  it("preserves the independent review date of a military center", () => {
    const university = universities.find((row) => row.slug === "stankin")!;
    const evidence = universityFactProfiles.find(
      (row) => row.universitySlug === "stankin",
    )!.facts.militaryCenter;
    expect(evidence.value).toBe(true);
    expect(evidence.sourceUrl).toBe("https://vuc.stankin.ru/");
    expect(evidence.checkedAt).toBe(university.militaryCenterCheckedAt);
    expect(evidence.checkedAt).not.toBe(university.directory?.checkedAt);
  });

  it("dates a newly verified website separately from the monitoring record", () => {
    for (const slug of ["mti", "guppros", "sportedu"]) {
      const university = universities.find((row) => row.slug === slug)!;
      const website = universityFactProfiles.find(
        (row) => row.universitySlug === slug,
      )!.facts.website;
      expect(website.value).toBe(university.website);
      expect(website.sourceUrl).toBe(university.directory?.websiteSourceUrl);
      expect(website.year).toBe(2026);
      expect(website.checkedAt).toBe(university.directory?.websiteCheckedAt);
      expect(website.checkedAt).not.toBe(university.directory?.checkedAt);
      expect(university.directory?.sourceYear).toBe(2025);
    }
    const unchanged = universities.find((row) => row.slug === "sfi")!;
    const original = universityFactProfiles.find(
      (row) => row.universitySlug === "sfi",
    )!.facts.website;
    expect(original.checkedAt).toBe(unchanged.directory?.checkedAt);
    expect(original.year).toBe(unchanged.directory?.sourceYear);
  });
});

describe("/sveden/ directory facts dated by the check (owner decision 25.11.2026)", () => {
  it("shows contacts and first faculty lists of batch universities", () => {
    const profile = getDirectoryDetails("academy-gps")!;
    expect(profile.fields.address?.value).toContain("Бориса Галушкина");
    expect(profile.fields.telephone?.value).toBeTruthy();
    expect(profile.faculties?.length).toBe(5);
    for (const faculty of profile.faculties ?? []) {
      expect(faculty.sourceYear).toBe(2026);
      expect(faculty.sourceUrl).toMatch(
        /^https:\/\/(?:www\.)?academygps\.ru\/sveden\/struct/,
      );
    }
  });

  it("never mixes a /sveden/ faculty list into a curated one or re-adds listings", () => {
    const curated = catalogFillNovember25.issues.filter(
      (issue) => issue.kind === "faculties_already_curated",
    );
    expect(curated.length).toBeGreaterThan(0);
    for (const issue of curated) {
      const profile = catalogFillNovember25.profiles.find(
        (row) => row.universitySlug === issue.universitySlug,
      )!;
      expect(profile.faculties).toHaveLength(0);
    }
    expect(getDirectoryDetails("mgimo")!.faculties).toHaveLength(12);
    for (const profile of catalogFillNovember25.profiles) {
      expect(profile.offerings).toHaveLength(0);
      for (const field of Object.values(profile.fields))
        expect(field.sourceYear).toBe(2026);
    }
  });
});
