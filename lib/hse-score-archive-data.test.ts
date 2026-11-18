import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Score = {
  value: number | null;
  status: string;
  raw?: string;
  maximum?: number | null;
};
type ArchiveRow = {
  id: string;
  campus: string;
  year: number;
  title: string;
  code: string | null;
  level?: string;
  competitionScopeKey?: string;
  source: string;
  scopeNoteRu: string;
  budget: Score;
  paid: Score;
  publishedUnassignedResult?: Score | null;
};
const serialized = readFileSync(
  "data-sources/release/2026-12/evidence/2026-11-16-hse-results-all.json",
  "utf8",
);
const archive = JSON.parse(serialized) as {
  records: ArchiveRow[];
  sources: Record<
    string,
    { url: string; bytes?: number; sha256?: string; captureKind?: string }
  >;
  knownConflicts: unknown[];
  excludedSources: { reasonRu: string }[];
  archiveExtensions20261118: {
    baseRecordsPreserved: number;
    packets: Record<string, { records: number }>;
    gaps: { campus: string; year: number; source?: string; reasonRu: string }[];
    captureValidation: { rawSourcesChecked: number; sourceIds: string[] };
  };
};
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const find = (campus: string, year: number, title: string) =>
  archive.records.filter(
    (row) => row.campus === campus && row.year === year && row.title === title,
  );

describe("HSE reviewed archival evidence", () => {
  it("preserves the 652 previously reviewed records, sources and conflicts", () => {
    expect(digest(archive.records.slice(0, 652))).toBe(
      "c70aa215631e8693c8647b4fdb47ce55338fbab2c6c44fbc8c20b4c4a89a7f08",
    );
    expect(
      digest(Object.fromEntries(Object.entries(archive.sources).slice(0, 29))),
    ).toBe("01080a71d21150a286c4b05079dcfbd80ec41e184eca1b785c7cf6601125b7ab");
    expect(digest(archive.knownConflicts)).toBe(
      "cac6beec373ea49216915453df24618b1770b84e8c18a5dde4a3e210f84aac3b",
    );
  });

  it("keeps campus, year, degree and competition scopes unique", () => {
    expect(archive.records).toHaveLength(2400);
    expect(archive.archiveExtensions20261118.packets.baCore.records).toBe(311);
    expect(
      archive.archiveExtensions20261118.packets.spbBachelorHistory.records,
    ).toBe(222);
    expect(
      archive.records.filter((row) => row.level === "Магистратура"),
    ).toHaveLength(1215);
    expect(archive.records.filter((row) => !row.level)).toHaveLength(1185);
    expect(new Set(archive.records.map((row) => row.id)).size).toBe(2400);
    const identities = archive.records.map((row) =>
      JSON.stringify([
        row.campus,
        row.year,
        row.level ?? "Бакалавриат и специалитет",
        row.title,
        row.competitionScopeKey ?? "general",
        row.code,
      ]),
    );
    expect(new Set(identities).size).toBe(2400);
  });

  it("retains unspecified funding as a published number without assigning budget", () => {
    const unassigned = archive.records.filter(
      (row) => row.publishedUnassignedResult?.value != null,
    );
    expect(unassigned).toHaveLength(631);
    for (const row of unassigned) {
      expect(row.budget).toMatchObject({ value: null, status: "unknown" });
      const result = row.publishedUnassignedResult!;
      expect(
        row.scopeNoteRu.includes(String(result.value)) ||
          row.scopeNoteRu.includes(result.raw!),
      ).toBe(true);
    }
    // A separate explicitly paid column may coexist with an unassigned free-place result.
    expect(
      unassigned.some(
        (row) => row.level === "Магистратура" && row.paid.value !== null,
      ),
    ).toBe(true);
  });

  it("does not turn different funding scopes into a budget-score conflict", () => {
    const perm = archive.records.filter(
      (row) => row.campus === "Пермь" && row.year === 2009,
    );
    expect(
      perm
        .filter((row) => row.budget.value !== null)
        .map((row) => row.budget.value),
    ).toEqual([223, 218, 215]);
    expect(
      perm
        .filter((row) => row.publishedUnassignedResult)
        .map((row) => row.publishedUnassignedResult!.value),
    ).toEqual([217, 222, 210]);
    expect(
      find("Санкт-Петербург", 2002, "Менеджмент").map(
        (row) => row.budget.value,
      ),
    ).toEqual([13, null]);
    for (const [year, title, budget, unassigned] of [
      [2010, "Экономика", 179, 279],
      [2014, "Востоковедение", 267, 268],
    ] as const) {
      const rows = find("Санкт-Петербург", year, title);
      expect(rows.some((row) => row.budget.value === budget)).toBe(true);
      expect(
        rows.some((row) => row.publishedUnassignedResult?.value === unassigned),
      ).toBe(true);
    }
    expect(
      find(
        "Санкт-Петербург",
        2024,
        "Компьютерные технологии, системы и сети",
      )[0].budget,
    ).toMatchObject({ value: null, status: "pending_review" });
  });

  it("publishes only positive verified scores within each explicitly supplied scale", () => {
    for (const row of archive.records) {
      expect(archive.sources[row.source]).toBeDefined();
      for (const score of [row.budget, row.paid]) {
        expect(score.status === "verified").toBe(score.value !== null);
        if (score.value !== null) {
          expect(score.value).toBeGreaterThan(0);
          if (score.maximum != null)
            expect(score.value).toBeLessThanOrEqual(score.maximum);
        }
      }
    }
    expect(
      archive.excludedSources.some((source) =>
        source.reasonRu.includes("первой волны"),
      ),
    ).toBe(true);
  });

  it("retains captured-source checks and honest gaps without exposing local files", () => {
    const extension = archive.archiveExtensions20261118;
    expect(extension.captureValidation.rawSourcesChecked).toBe(120);
    expect(extension.captureValidation.sourceIds).toHaveLength(120);
    for (const key of extension.captureValidation.sourceIds) {
      expect(archive.sources[key].sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(archive.sources[key].bytes).toBeGreaterThan(0);
    }
    expect(
      extension.gaps.some(
        (gap) => gap.campus === "Пермь" && gap.year === 2015 && gap.source,
      ),
    ).toBe(true);
    expect(
      extension.gaps.some(
        (gap) => gap.year === 2025 && gap.reasonRu.includes("не завершена"),
      ),
    ).toBe(true);
    expect(
      /localFile|visualEvidence|file:\/\/|(?<![A-Za-z])[A-Z]:[\\/]/i.test(
        serialized,
      ),
    ).toBe(false);
    for (const source of Object.values(archive.sources)) {
      expect(new URL(source.url).hostname).toMatch(/(^|\.)hse\.ru$/);
    }
  });
});
