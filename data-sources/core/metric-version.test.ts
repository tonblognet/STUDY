import { describe, expect, it } from "vitest";
import {
  matchesPersistedMetric,
  matchesPersistedUniversityFact,
  type PersistedMetric,
} from "./metric-version";
import type { SourcedValue } from "../../lib/admissions/types";

const field: SourcedValue<number> = {
  value: 42,
  year: 2026,
  status: "verified",
  sourceUrl: "https://example.edu/admission.pdf",
  sourceName: "Example University",
  sourceDocumentTitle: "Admission plan",
  sourcePage: 4,
  sourceSection: "09.03.01",
  retrievedAt: "2026-08-20T10:00:00.000Z",
  checkedAt: "2026-08-21T11:00:00.000Z",
  checkedBy: "Редакция",
  nextReviewAt: "2026-09-21T11:00:00.000Z",
  note: "Проверено по строке программы",
};

const persisted: PersistedMetric = {
  value: 42,
  status: "VERIFIED",
  sourceUrl: field.sourceUrl,
  sourceName: field.sourceName,
  sourceDocumentTitle: field.sourceDocumentTitle ?? null,
  sourcePage: field.sourcePage ?? null,
  sourceSheet: null,
  sourceRange: null,
  sourceSection: field.sourceSection ?? null,
  retrievedAt: new Date(field.retrievedAt),
  checkedAt: new Date(field.checkedAt),
  checkedBy: field.checkedBy,
  nextReviewAt: new Date(field.nextReviewAt!),
  note: field.note ?? null,
};

describe("версионирование импортируемой метрики", () => {
  it("сохраняет идемпотентность для полностью одинакового значения и provenance", () => {
    expect(matchesPersistedMetric(persisted, field)).toBe(true);
  });

  it.each([
    ["sourceDocumentTitle", "Другой документ"],
    ["sourcePage", 5],
    ["sourceSection", "09.03.02"],
    ["checkedAt", "2026-08-22T11:00:00.000Z"],
    ["checkedBy", "Другой редактор"],
    ["nextReviewAt", "2026-10-21T11:00:00.000Z"],
    ["note", "Уточнено по новой таблице"],
  ])("создаёт новую версию при изменении %s", (key, value) => {
    expect(matchesPersistedMetric(persisted, { ...field, [key]: value })).toBe(
      false,
    );
  });

  it("считает отсутствующие optional-поля и database null одинаковыми", () => {
    const withoutOptional = {
      ...field,
      sourceDocumentTitle: undefined,
      sourcePage: undefined,
      sourceSection: undefined,
      nextReviewAt: undefined,
      note: undefined,
    };
    expect(
      matchesPersistedMetric(
        {
          ...persisted,
          sourceDocumentTitle: null,
          sourcePage: null,
          sourceSection: null,
          nextReviewAt: null,
          note: null,
        },
        withoutOptional,
      ),
    ).toBe(true);
  });

  it("создаёт новую university fact версию при изменении типа источника", () => {
    expect(
      matchesPersistedUniversityFact(
        { ...persisted, sourceType: "OFFICIAL_HTML" },
        { ...field, sourceKind: "html" },
      ),
    ).toBe(true);
    expect(
      matchesPersistedUniversityFact(
        { ...persisted, sourceType: "OFFICIAL_PDF" },
        { ...field, sourceKind: "html" },
      ),
    ).toBe(false);
  });
});
