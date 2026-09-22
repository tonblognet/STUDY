import { describe, expect, it } from "vitest";
import { baselineCatalog } from "./baseline";
import { parseCatalog } from "./schema";
import { catalogChecksum, catalogDiff } from "./diff";
import { applyProgramEdit } from "./program-edit";
import { assertCatalogEditor } from "./service";
import { mergeUniversity, parseImportEnvelope } from "@/scripts/catalog";

describe("catalog publication boundaries", () => {
  it("rejects malformed import envelopes instead of silently importing the baseline", () => {
    for (const input of [
      null,
      {},
      { snapshot: baselineCatalog() },
      { snapshot: baselineCatalog(), baseRevisionId: 42 },
    ]) {
      expect(() => parseImportEnvelope(input)).toThrow(
        /snapshot.*baseRevisionId/,
      );
    }
    expect(
      parseImportEnvelope({ snapshot: baselineCatalog(), baseRevisionId: null })
        .snapshot.programs,
    ).toHaveLength(185);
  });
  it("accepts every existing program, source profile and separate creative campaign", () => {
    const snapshot = parseCatalog(baselineCatalog());
    expect(snapshot.programs).toHaveLength(185);
    expect(snapshot.universities).toHaveLength(162);
    expect(snapshot.admissionCampaigns[0].groups).toHaveLength(5);
    expect(
      snapshot.programs.find((row) => row.slug === "mgu-01-05-01-1")
        ?.passingScore,
    ).toBeNull();
  });
  it("rejects untrusted domains, malformed dates and inconsistent public values", () => {
    for (const mutate of [
      (s: ReturnType<typeof baselineCatalog>) => {
        s.programs[0].tuitionValue.sourceUrl = "https://evil.example/fees";
      },
      (s: ReturnType<typeof baselineCatalog>) => {
        s.programs[0].tuitionValue.checkedAt = "yesterday";
      },
      (s: ReturnType<typeof baselineCatalog>) => {
        s.programs[0].tuition = 1;
      },
      (s: ReturnType<typeof baselineCatalog>) => {
        s.programs.push(s.programs[0]);
      },
    ]) {
      const snapshot = baselineCatalog();
      mutate(snapshot);
      expect(() => parseCatalog(snapshot)).toThrow();
    }
  });
  it("keeps source-only changes and suspicious quantities visible in the diff", () => {
    const before = baselineCatalog(),
      after = baselineCatalog();
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
    const original = baselineCatalog(),
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
    const current = baselineCatalog(),
      incoming = baselineCatalog();
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
