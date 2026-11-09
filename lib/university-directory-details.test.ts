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

describe("official university profile evidence", () => {
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
    expect(getDirectoryDetails("mephi")!.offerings).toHaveLength(77);
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
      getDirectoryDetails("rsuh")!.offerings.filter(
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
    for (const profile of directoryDetails) {
      expect(universities.some((u) => u.slug === profile.universitySlug)).toBe(
        true,
      );
      expect(new Set(profile.offerings.map((row) => row.id)).size).toBe(
        profile.offerings.length,
      );
      for (const row of profile.offerings) {
        expect(row.code).toMatch(/^\d{2}\.(03|04|05|06|07|08|09)\.\d{2}$/);
        expect(row.admissionsStatus).toBe("pending_review");
        expect(ids.has(row.id)).toBe(false);
        expect(row.sourceUrl).toMatch(/^https?:\/\//);
        expect(row.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
      }
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
