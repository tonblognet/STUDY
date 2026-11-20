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
  identityNoteRu?: string;
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
  moscowResults2026Extension: {
    earlierFacultySnapshots: {
      originalIndex: number;
      preferredRecordId: string;
      record: ArchiveRow;
    }[];
  };
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
  documentExtension20261118: {
    baseRecordsPreserved: number;
    baseRecordsSha256: string;
    summary: {
      records: number;
      numericBudget: number;
      numericPaid: number;
      unassigned: number;
      rawSourceHashesChecked: number;
    };
    excludedRecordScopes: {
      source: string;
      locator: string;
      reasonRu: string;
    }[];
    sourceReviewsWithoutResults: {
      campus: string;
      year: number;
      level: string;
      source: string;
      reviewStatus: string;
      locator: string;
      reasonRu: string;
    }[];
  };
};
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const centralSource = "moscow-ba-results-2026-reviewed-2026-11-19";
const earlierArchive = archive.records.filter(
  (row) => row.source !== centralSource,
);
for (const snapshot of archive.moscowResults2026Extension
  .earlierFacultySnapshots) {
  earlierArchive.splice(snapshot.originalIndex, 0, snapshot.record);
}
const find = (campus: string, year: number, title: string) =>
  archive.records.filter(
    (row) => row.campus === campus && row.year === year && row.title === title,
  );

describe("HSE reviewed archival evidence", () => {
  it("preserves the 652 previously reviewed records, sources and conflicts", () => {
    expect(digest(earlierArchive.slice(0, 652))).toBe(
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
    expect(archive.records).toHaveLength(2736);
    expect(archive.archiveExtensions20261118.packets.baCore.records).toBe(311);
    expect(
      archive.archiveExtensions20261118.packets.spbBachelorHistory.records,
    ).toBe(222);
    expect(
      archive.records.filter((row) => row.level === "Магистратура"),
    ).toHaveLength(1486);
    expect(archive.records.filter((row) => !row.level)).toHaveLength(1250);
    expect(new Set(archive.records.map((row) => row.id)).size).toBe(2736);
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
    expect(new Set(identities).size).toBe(2736);
  });

  it("retains unspecified funding as a published number without assigning budget", () => {
    const unassigned = archive.records.filter(
      (row) => row.publishedUnassignedResult?.value != null,
    );
    expect(unassigned).toHaveLength(678);
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
      (row) => row.campus === "Пермь" && row.year === 2009 && !row.level,
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
      /localFile|visualEvidence|file:\/\/|(?<![A-Za-z])[A-Z]:[\\/]/i.test(
        serialized,
      ),
    ).toBe(false);
    for (const source of Object.values(archive.sources)) {
      expect(new URL(source.url).hostname).toMatch(/(^|\.)hse\.ru$/);
    }
  });

  it("preserves all 2400 records preceding the masters document extension", () => {
    const expected =
      "161a7cc85024903e40a481c3dd1ab3d60af18c50f4e8182de1d23c11faa8990a";
    expect(digest(earlierArchive.slice(0, 2400))).toBe(expected);
    expect(archive.documentExtension20261118.baseRecordsPreserved).toBe(2400);
    expect(archive.documentExtension20261118.baseRecordsSha256).toBe(expected);
  });

  it("keeps the new masters results in their published funding categories", () => {
    const rows = earlierArchive.slice(2400);
    expect(rows).toHaveLength(271);
    expect(rows.every((row) => row.id.startsWith("hse-ma-doc-"))).toBe(true);
    expect(rows.every((row) => row.level === "Магистратура")).toBe(true);
    expect(rows.filter((row) => row.budget.value !== null)).toHaveLength(215);
    expect(rows.filter((row) => row.paid.value !== null)).toHaveLength(82);
    expect(rows.filter((row) => row.publishedUnassignedResult)).toHaveLength(
      47,
    );
    expect(archive.documentExtension20261118.summary).toMatchObject({
      records: 271,
      numericBudget: 215,
      numericPaid: 82,
      unassigned: 47,
      rawSourceHashesChecked: 24,
    });
    for (const row of rows.filter((entry) => entry.publishedUnassignedResult)) {
      expect(row.budget).toMatchObject({ value: null, status: "unknown" });
      expect(row.paid).toMatchObject({ value: null, status: "unknown" });
    }
  });

  it("adds the central Moscow 2026 outcomes while retaining all earlier evidence", () => {
    expect(digest(earlierArchive)).toBe(
      "66fbc8e95eda39bd97641059287997d302df436b2faf181ba4771c873b8cc76c",
    );
    const rows = archive.records.filter((row) => row.source === centralSource);
    expect(rows).toHaveLength(72);
    expect(
      rows.every(
        (row) => row.campus === "Москва" && row.year === 2026 && !row.level,
      ),
    ).toBe(true);
    expect(rows.filter((row) => row.budget.value !== null)).toHaveLength(50);
    expect(rows.filter((row) => row.paid.value !== null)).toHaveLength(70);
    const { earlierFacultySnapshots } = archive.moscowResults2026Extension;
    expect(earlierFacultySnapshots).toHaveLength(7);
    for (const { preferredRecordId, record } of earlierFacultySnapshots) {
      expect(archive.records.some((entry) => entry.id === record.id)).toBe(
        false,
      );
      const preferred = rows.find((entry) => entry.id === preferredRecordId)!;
      expect(preferred).toMatchObject({
        campus: record.campus,
        year: record.year,
        code: record.code,
        title: record.title,
      });
      for (const funding of ["budget", "paid"] as const)
        if (record[funding].value !== null)
          expect(preferred[funding].value).toBe(record[funding].value);
    }
    const priority = rows.find(
      (row) => row.title === "Прикладная математика и информатика",
    )!;
    expect(priority.budget).toMatchObject({
      value: null,
      status: "not_applicable",
      raw: "-*",
    });
    expect(priority.paid.value).toBe(259);
    const source = archive.sources[rows[0].source];
    expect(source.captureKind).toBe("official_web_text_extraction");
    expect(source.url).toBe("https://ba.hse.ru/result2026");
  });

  it("retains the five visually checked Perm 2025 budget results on the stated 100-point scale", () => {
    const rows = archive.records.filter(
      (row) =>
        row.level === "Магистратура" &&
        row.campus === "Пермь" &&
        row.year === 2025,
    );
    expect(rows).toHaveLength(5);
    expect(
      Object.fromEntries(rows.map((row) => [row.title, row.budget.value])),
    ).toEqual({
      "Управление развитием бизнеса": 71.5,
      "Государственное и муниципальное управление": 71.28,
      "Бизнес-аналитика": 75.92,
      "Финансовые стратегии и аналитика": 68.88,
      "Правовое обеспечение предпринимательской деятельности": 72,
    });
    for (const row of rows) {
      expect(row.budget.status).toBe("verified");
      expect(row.budget.maximum).toBe(100);
      expect(row.paid).toMatchObject({ value: null, status: "unknown" });
    }
  });

  it("does not publish contract criteria or proposed Moscow cutoffs as actual results", () => {
    const rows2012 = archive.records.filter(
      (row) =>
        row.level === "Магистратура" &&
        row.campus === "Москва" &&
        row.year === 2012,
    );
    expect(rows2012).toHaveLength(54);
    for (const row of rows2012) {
      expect(row.budget.status).toBe("verified");
      expect(row.paid).toMatchObject({ value: null, status: "unknown" });
    }
    const rows2010 = archive.records.filter(
      (row) =>
        row.level === "Магистратура" &&
        row.campus === "Москва" &&
        row.year === 2010,
    );
    expect(rows2010).toHaveLength(30);
    expect(rows2010.every((row) => row.source.includes("2010-report"))).toBe(
      true,
    );
    expect(
      rows2010.find(
        (row) => row.title === "Прикладные методы социального анализа рынков",
      )?.budget,
    ).toMatchObject({ value: 50, status: "verified", maximum: 100 });
    const excluded = archive.documentExtension20261118.excludedRecordScopes;
    expect(
      excluded.some((entry) =>
        entry.locator.includes("Предложения по проходному баллу"),
      ),
    ).toBe(true);
    expect(
      excluded.some((entry) =>
        entry.locator.includes("Необходимые баллы для заключения договоров"),
      ),
    ).toBe(true);
  });

  it("preserves literal truncated programme names without inventing a current identity", () => {
    const rows = archive.records.filter(
      (row) =>
        row.level === "Магистратура" &&
        row.campus === "Москва" &&
        row.year === 2012,
    );
    for (const title of [
      "Международные отношения: европейские и азиатские",
      "Маркетинговые коммуникации и реклама в современном бизнес",
    ]) {
      const row = rows.find((entry) => entry.title === title)!;
      expect(row).toBeDefined();
      expect(row.identityNoteRu).toContain("усечённым");
      expect(row.identityNoteRu).toContain("без придуманного окончания");
    }
    expect(
      rows.some(
        (row) =>
          row.title ===
          "Международные отношения: европейские и азиатские исследования",
      ),
    ).toBe(false);
  });

  it("retains year-specific exam scales and explicitly university-funded results", () => {
    for (const [year, maximum] of [
      [2009, 22],
      [2010, 30],
      [2011, 35],
    ]) {
      const rows = archive.records.filter(
        (row) =>
          row.level === "Магистратура" &&
          row.campus === "Пермь" &&
          row.year === year,
      );
      expect(rows.length).toBeGreaterThan(0);
      expect(
        rows.every((row) => row.publishedUnassignedResult?.maximum === maximum),
      ).toBe(true);
    }
    const history = find(
      "Пермь",
      2021,
      "Цифровые методы в гуманитарных науках",
    ).find((row) => row.level === "Магистратура")!;
    expect(history.budget).toMatchObject({ value: null, status: "unknown" });
    expect(history.paid).toMatchObject({ value: null, status: "unknown" });
    expect(history.publishedUnassignedResult).toMatchObject({
      value: 62.9,
      maximum: 100,
      raw: "62,90*",
    });
    expect(history.scopeNoteRu).toContain("за счёт средств НИУ ВШЭ");
    expect(
      find(
        "Москва",
        2016,
        "Иностранные языки и межкультурная коммуникация",
      ).find((row) => row.level === "Магистратура")?.budget,
    ).toMatchObject({ value: 126, maximum: null });
  });

  it("keeps four completed source reviews as gaps rather than invented passing scores", () => {
    const reviews =
      archive.documentExtension20261118.sourceReviewsWithoutResults;
    expect(
      reviews.map((review) => `${review.campus}:${review.year}`).sort(),
    ).toEqual(["Москва:2011", "Москва:2025", "Пермь:2012", "Пермь:2015"]);
    for (const review of reviews) {
      expect(review.reviewStatus).toBe(
        "source_review_completed_no_actual_passing_table_found",
      );
      expect(review.level).toBe("Магистратура");
      expect(archive.sources[review.source]).toBeDefined();
      expect(review.locator).toBeTruthy();
      expect(review.reasonRu).toMatch(
        /не найдена|не содержит числовой таблицы/,
      );
      expect(
        archive.records.some(
          (row) =>
            row.level === "Магистратура" &&
            row.campus === review.campus &&
            row.year === review.year,
        ),
      ).toBe(false);
    }
  });
});
