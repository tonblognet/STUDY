import { assertOfficialSource } from "./adapter";
import { getUniversityAdapter } from "../universities";
import {
  universitySourcedFields,
  type UniversityFactProfile,
} from "../../lib/university-facts";

export function validateUniversityFactProfile(profile: UniversityFactProfile) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const adapter = getUniversityAdapter(profile.universitySlug);
  if (!adapter) return { errors: ["не найден adapter университета"], warnings };

  const campusIds = profile.campuses.map(({ id }) => id);
  if (new Set(campusIds).size !== campusIds.length)
    errors.push("дублирующиеся идентификаторы кампусов");

  for (const [key, field] of universitySourcedFields(profile)) {
    try {
      assertOfficialSource(adapter, {
        category:
          key === "logo_url"
            ? "logos"
            : key.startsWith("campus:")
              ? "campuses"
              : "facts",
        url: field.sourceUrl,
        title: key,
        year: field.year,
        format: field.sourceKind ?? "html",
        locator: field.sourceSection,
      });
    } catch {
      errors.push(`${key}: неофициальный URL`);
    }
    if (field.value === null && field.status === "verified")
      errors.push(`${key}: null не может быть verified`);
    if (field.value !== null && field.status === "not_published")
      errors.push(`${key}: значение не может быть not_published`);
    if (
      !field.sourceKind ||
      !field.sourceUrl ||
      !field.sourceName ||
      !field.retrievedAt ||
      !field.checkedAt ||
      !field.checkedBy
    )
      errors.push(`${key}: неполные метаданные происхождения`);
    if (
      key === "dormitory_count" &&
      field.value !== null &&
      (typeof field.value !== "number" ||
        !Number.isInteger(field.value) ||
        field.value < 0)
    )
      errors.push(`${key}: ожидается целое неотрицательное число`);
    if (field.status === "pending_review")
      warnings.push(`${key}: ожидает проверки`);
  }

  return { errors, warnings };
}
