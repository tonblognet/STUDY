import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { baselineCatalog } from "./baseline";
import { parseCatalog } from "./schema";
import { catalogChecksum, catalogDiff } from "./diff";
import { applyProgramEdit } from "./program-edit";
import { assertCatalogEditor, stageCatalog } from "./service";
import { mergeUniversity, parseImportEnvelope } from "@/scripts/catalog";
import { universities } from "@/lib/data";
import type { CatalogSnapshot } from "./types";

const repositoryCatalog = baselineCatalog();

/** Isolate mutations while keeping every relation within the requested universities. */
function scopedCatalog(...slugs: string[]): CatalogSnapshot {
  const scope = new Set(slugs);
  return structuredClone({
    schemaVersion: repositoryCatalog.schemaVersion,
    programs: repositoryCatalog.programs.filter((row) =>
      scope.has(row.universitySlug),
    ),
    universities: repositoryCatalog.universities.filter((row) =>
      scope.has(row.slug),
    ),
    universityFacts: repositoryCatalog.universityFacts.filter((row) =>
      scope.has(row.universitySlug),
    ),
    directoryDetails: repositoryCatalog.directoryDetails.filter((row) =>
      scope.has(row.universitySlug),
    ),
    admissionCampaigns: repositoryCatalog.admissionCampaigns.filter((row) =>
      scope.has(row.universitySlug),
    ),
  });
}

describe("catalog publication boundaries", () => {
  it("rejects a prepared import if a publication advances its base before the lock", async () => {
    const before = scopedCatalog("hse");
    const incoming = structuredClone(before);
    incoming.universities[0].description += " — prepared import";
    let publishedId = "base";
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      catalogHead: {
        findUniqueOrThrow: vi.fn(async () => ({
          revisionId: publishedId,
          revision: { id: publishedId, checksum: "new-publication" },
        })),
      },
      catalogRevision: { findUnique: vi.fn(), create: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    const db = {
      catalogHead: {
        findUniqueOrThrow: vi.fn(async () => ({
          revisionId: publishedId,
          revision: { checksum: catalogChecksum(before), payload: before },
        })),
      },
      $transaction: vi.fn(
        async (work: (client: typeof tx) => Promise<unknown>) => {
          // Another editor commits after the immutable base was read but before
          // this transaction can acquire the shared publication lock.
          publishedId = "advanced";
          return work(tx);
        },
      ),
    };
    await expect(
      stageCatalog(db as unknown as PrismaClient, incoming, {
        actor: { id: "test-editor", role: "ADMIN" },
        reason: "Проверка смены основы во время импорта",
        expectedRevisionId: "base",
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(db.catalogHead.findUniqueOrThrow).toHaveBeenCalledOnce();
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.catalogHead.findUniqueOrThrow).toHaveBeenCalledOnce();
    expect(tx.catalogRevision.findUnique).not.toHaveBeenCalled();
    expect(tx.catalogRevision.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
  it("requires faculty provenance and rejects duplicate units and untrusted unit links", () => {
    const snapshot = scopedCatalog("sfi");
    const profile = snapshot.directoryDetails.find(
      (row) => row.universitySlug === "sfi",
    )!;
    const faculty = {
      name: "Исторический факультет",
      url: "https://sfi.ru/study/",
      sourceUrl: "https://sfi.ru/about/sveden/struct.html",
      sourceYear: 2026,
      checkedAt: "2026-10-09T12:00:00Z",
      sourceSha256: "a".repeat(64),
    };
    profile.faculties = [faculty];
    expect(
      parseCatalog(snapshot).directoryDetails.find(
        (row) => row.universitySlug === "sfi",
      )!.faculties,
    ).toEqual([faculty]);
    profile.faculties.push({ ...faculty, name: "ИСТОРИЧЕСКИЙ ФАКУЛЬТЕТ" });
    expect(() => parseCatalog(snapshot)).toThrow(/Дубли.*Факультеты/);
    profile.faculties = [{ ...faculty, url: "https://evil.example/faculty" }];
    expect(() => parseCatalog(snapshot)).toThrow(/Неофициальный/);
    profile.faculties = [{ ...faculty, sourceSha256: "missing" }];
    expect(() => parseCatalog(snapshot)).toThrow(/sourceSha256/);
  });
  it("preserves sourced multiple exams and rejects duplicates, impossible bounds and foreign sources", () => {
    const snapshot = scopedCatalog("hse");
    const program = snapshot.programs[0];
    const fact = {
      ...program.passingScoreValue,
      year: program.trust.dataYear,
      value: 50,
      status: "verified" as const,
    };
    program.additionalExams = [
      {
        id: "creative",
        title: { ...program.dviValue, value: "Творческое", status: "verified" },
        minimum: fact,
        maximum: { ...fact, value: 100 },
      },
    ];
    program.accreditation = {
      ...program.hostel,
      value: null,
      status: "pending_review",
    };
    expect(parseCatalog(snapshot).programs[0].additionalExams).toEqual(
      program.additionalExams,
    );
    const duplicate = structuredClone(snapshot);
    duplicate.programs[0].additionalExams!.push(program.additionalExams[0]);
    expect(() => parseCatalog(duplicate)).toThrow(/Дубли/);
    program.additionalExams[0].maximum.value = 40;
    expect(() => parseCatalog(snapshot)).toThrow(/Минимум ДВИ/);
    program.additionalExams[0].maximum.value = 100;
    program.additionalExams[0].minimum.sourceUrl = "https://evil.example/exams";
    expect(() => parseCatalog(snapshot)).toThrow(/Неофициальный/);
  });
  it("rejects malformed import envelopes instead of silently importing the baseline", () => {
    for (const input of [
      null,
      {},
      { snapshot: repositoryCatalog },
      { snapshot: repositoryCatalog, baseRevisionId: 42 },
    ]) {
      expect(() => parseImportEnvelope(input)).toThrow(
        /snapshot.*baseRevisionId/,
      );
    }
    expect(
      parseImportEnvelope({ snapshot: repositoryCatalog, baseRevisionId: null })
        .snapshot.programs,
    ).toHaveLength(185);
  });
  it("accepts every existing program, source profile and separate creative campaign", () => {
    const snapshot = parseCatalog(repositoryCatalog);
    expect(snapshot.programs).toHaveLength(185);
    expect(snapshot.universities).toHaveLength(universities.length);
    expect(snapshot.admissionCampaigns[0].groups).toHaveLength(5);
    expect(
      snapshot.programs.find((row) => row.slug === "mgu-01-05-01-1")
        ?.passingScore,
    ).toBeNull();
  });
  it("rejects untrusted domains, malformed dates and inconsistent public values", () => {
    for (const mutate of [
      (s: CatalogSnapshot) => {
        s.programs[0].tuitionValue.sourceUrl = "https://evil.example/fees";
      },
      (s: CatalogSnapshot) => {
        s.programs[0].tuitionValue.checkedAt = "yesterday";
      },
      (s: CatalogSnapshot) => {
        s.programs[0].tuition = 1;
      },
      (s: CatalogSnapshot) => {
        s.programs.push(s.programs[0]);
      },
    ]) {
      const snapshot = scopedCatalog("hse");
      mutate(snapshot);
      expect(() => parseCatalog(snapshot)).toThrow();
    }
  });
  it("keeps source-only changes and suspicious quantities visible in the diff", () => {
    const before = scopedCatalog("hse"),
      after = scopedCatalog("hse");
    after.programs[0].budgetPlacesValue.value = 10000;
    after.programs[0].tuitionValue.sourceSection = "New official section";
    const changes = catalogDiff(before, after);
    expect(
      changes.find((change) => change.path.endsWith("budgetPlacesValue"))
        ?.suspicious,
    ).toBe(true);
    expect(
      changes.find((change) => change.path.endsWith("tuitionValue"))?.after,
    ).toHaveProperty("sourceUrl");
    expect(catalogChecksum(before)).not.toBe(catalogChecksum(after));
    expect(catalogChecksum({ a: 1, b: 2 })).toBe(
      catalogChecksum({ b: 2, a: 1 }),
    );
  });
  it("does not turn a pending correction into a public number or mutate the original", () => {
    const original = scopedCatalog("hse"),
      program = original.programs[0];
    const next = applyProgramEdit(original, program.slug, {
      baseRevisionId: "base",
      field: "tuition",
      fact: { ...program.tuitionValue, value: 42, status: "pending_review" },
      reason: "Проверка нового источника",
    });
    expect(next.programs[0].tuition).toBeNull();
    expect(next.programs[0].tuitionValue.value).toBe(42);
    expect(program.tuition).not.toBeNull();
    expect(() =>
      applyProgramEdit(original, program.slug, {
        baseRevisionId: "base",
        field: "tuition",
        fact: { ...program.tuitionValue, year: 2027 },
        reason: "Другой год приёма",
      }),
    ).toThrow(/Год/);
  });
  it("keeps other universities' approved edits during a scoped import", () => {
    const current = scopedCatalog("hse", "mgu"),
      incoming = scopedCatalog("hse", "mgu");
    current.programs[0].tuitionValue.note = "Approved editor note";
    const next = mergeUniversity(current, incoming, "mgu");
    expect(
      next.programs.find((row) => row.id === current.programs[0].id)
        ?.tuitionValue.note,
    ).toBe("Approved editor note");
  });
  it("rejects applicants and support staff at the service boundary", () => {
    expect(() => assertCatalogEditor({ id: "a", role: "USER" })).toThrow();
    expect(() => assertCatalogEditor({ id: "a", role: "SUPPORT" })).toThrow();
    expect(() =>
      assertCatalogEditor({ id: "a", role: "CONTENT_MANAGER" }),
    ).not.toThrow();
  });
});
