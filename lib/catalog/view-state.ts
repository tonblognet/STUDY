import { z } from "zod";

const text = z.string().max(200);
export const programViewSchema = z.object({
  query: text.catch(""),
  subjects: z.array(z.string().max(80)).max(15).catch([]),
  onlyBudget: z.boolean().catch(false),
  maxScore: z.number().int().min(150).max(1000).nullable().catch(null),
  maxPrice: z.number().int().min(100000).max(1200000).catch(1200000),
  form: z.enum(["Любая", "Очная", "Очно-заочная", "Заочная"]).catch("Любая"),
  hostel: z.enum(["Любое", "Есть", "Нет"]).catch("Любое"),
  militaryCenter: z.enum(["Любое", "Есть", "Нет"]).catch("Любое"),
  university: text.catch("Все вузы"),
  level: z.enum(["Любой", "Бакалавриат", "Специалитет"]).catch("Любой"),
  dataStatus: z
    .enum(["Любой", "verified", "pending_review", "not_published"])
    .catch("Любой"),
  sort: z.enum(["quality", "score", "price", "places"]).catch("quality"),
  limit: z.number().int().min(24).max(1000).catch(24),
});
export const universityViewSchema = z.object({
  query: text.catch(""),
  ownership: z.enum(["all", "state", "private"]).catch("all"),
  detailsFilter: z
    .enum(["all", "contacts", "offerings", "extract"])
    .catch("all"),
  limit: z.number().int().min(24).max(1000).catch(24),
});
export const matchViewSchema = z.object({
  category: z
    .enum(["all", "high", "competitive", "ambitious", "insufficient"])
    .catch("all"),
  eligibility: z
    .enum(["all", "eligible", "unknown", "ineligible"])
    .catch("all"),
  query: text.catch(""),
  university: text.catch("all"),
  level: z.enum(["all", "Бакалавриат", "Специалитет"]).catch("all"),
  form: z.enum(["all", "Очная", "Очно-заочная", "Заочная"]).catch("all"),
  funding: z.enum(["all", "budget", "paid"]).catch("all"),
  maxPrice: z
    .string()
    .regex(/^\d{0,8}$/)
    .catch(""),
  hostel: z.boolean().catch(false),
  military: z.boolean().catch(false),
  accreditation: z.enum(["all", "verified", "unknown"]).catch("all"),
  quality: z
    .enum([
      "all",
      "verified",
      "pending_review",
      "not_published",
      "outdated",
      "conflicting_sources",
      "not_applicable",
    ])
    .catch("all"),
});

export function decodeView<T>(schema: z.ZodType<T>, raw: string | null): T {
  try {
    // Bound untrusted URL/storage input before parsing.
    if (raw && raw.length <= 6000) {
      const result = schema.safeParse(JSON.parse(raw));
      if (result.success) return result.data;
    }
  } catch {
    /* Invalid or obsolete saved filters are reset. */
  }
  return schema.parse({});
}

export function viewFromSearch(search: string): string | null {
  const params = new URLSearchParams(search);
  if (params.has("filters")) return params.get("filters");
  // An explicit catalog link overrides a previously saved search.
  if (params.has("q")) return JSON.stringify({ query: params.get("q") });
  return null;
}

export type ViewSearch = { q?: string | string[]; filters?: string | string[] };
export function initialView<T>(
  schema: z.ZodType<T>,
  params: ViewSearch,
): string {
  const raw =
    typeof params.filters === "string"
      ? params.filters
      : typeof params.q === "string"
        ? JSON.stringify({ query: params.q })
        : null;
  return JSON.stringify(decodeView(schema, raw));
}
