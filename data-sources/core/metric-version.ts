import { isDeepStrictEqual } from "node:util";
import type { SourcedValue } from "../../lib/admissions/types";

export type PersistedMetric = {
  value: unknown;
  status: string;
  sourceUrl: string;
  sourceName: string;
  sourceDocumentTitle: string | null;
  sourcePage: number | null;
  sourceSheet: string | null;
  sourceRange: string | null;
  sourceSection: string | null;
  retrievedAt: Date;
  checkedAt: Date;
  checkedBy: string;
  nextReviewAt: Date | null;
  note: string | null;
};

const optional = <T>(value: T | null | undefined) => value ?? null;
const timestamp = (value: Date | string | null | undefined) =>
  value ? new Date(value).toISOString() : null;

export function matchesPersistedMetric(
  current: PersistedMetric | null | undefined,
  field: SourcedValue<unknown>,
) {
  if (!current) return false;

  return (
    isDeepStrictEqual(optional(current.value), optional(field.value)) &&
    current.status === field.status.toUpperCase() &&
    current.sourceUrl === field.sourceUrl &&
    current.sourceName === field.sourceName &&
    optional(current.sourceDocumentTitle) ===
      optional(field.sourceDocumentTitle) &&
    optional(current.sourcePage) === optional(field.sourcePage) &&
    optional(current.sourceSheet) === optional(field.sourceSheet) &&
    optional(current.sourceRange) === optional(field.sourceRange) &&
    optional(current.sourceSection) === optional(field.sourceSection) &&
    timestamp(current.retrievedAt) === timestamp(field.retrievedAt) &&
    timestamp(current.checkedAt) === timestamp(field.checkedAt) &&
    current.checkedBy === field.checkedBy &&
    timestamp(current.nextReviewAt) === timestamp(field.nextReviewAt) &&
    optional(current.note) === optional(field.note)
  );
}
