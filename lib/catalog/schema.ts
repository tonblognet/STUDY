import { z } from "zod";
import { getUniversityAdapter } from "@/data-sources/universities";
import { assertOfficialSource } from "@/data-sources/core/adapter";
import { validateUniversityFactProfile } from "@/data-sources/core/university-fact-validation";
import { validateAdmissionCampaign } from "@/lib/university-admission-campaigns";
import type { CatalogSnapshot } from "./types";
import { CatalogError } from "./types";
import { directoryDetails as repositoryDirectoryDetails } from "@/lib/university-directory-details";

// Preserve exact, previously reviewed directory evidence (including official
// registry documents and university redirects); it is not an arbitrary host allowlist.
function knownDirectoryUrls(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) =>
    ["sourceUrl", "url", "pageUrl"].includes(key) && typeof child === "string"
      ? [child]
      : knownDirectoryUrls(child),
  );
}
const repositoryDirectorySources = new Map(
  repositoryDirectoryDetails.map((row) => [
    row.universitySlug,
    new Set(knownDirectoryUrls(row)),
  ]),
);

const text = z.string().min(1);
const date = text.refine(
  (value) => Number.isFinite(Date.parse(value)),
  "Некорректная дата",
);
const url = z
  .url()
  .refine(
    (value) =>
      /^https?:\/\//.test(value) &&
      !new URL(value).username &&
      !new URL(value).password,
    "Нужен HTTP(S) источник без учётных данных",
  );
const status = z.enum([
  "verified",
  "not_published",
  "pending_review",
  "outdated",
  "conflicting_sources",
  "not_applicable",
]);
const sourceKind = z.enum(["html", "pdf", "xlsx", "csv", "docx"]);
export const sourcedSchema = <T extends z.ZodType>(value: T) =>
  z
    .object({
      value: value.nullable(),
      year: z.number().int().min(1900).max(2200),
      status,
      sourceUrl: url,
      sourceName: text,
      sourceKind: sourceKind.optional(),
      sourceDocumentTitle: z.string().optional(),
      sourcePage: z.number().int().positive().optional(),
      sourceSheet: z.string().optional(),
      sourceRange: z.string().optional(),
      sourceSection: z.string().optional(),
      retrievedAt: date,
      checkedAt: date,
      checkedBy: text,
      nextReviewAt: date.optional(),
      note: z.string().optional(),
    })
    .strict()
    .superRefine((field, ctx) => {
      const factValue = (field as { value?: unknown }).value;
      if (field.status === "verified" && factValue === null)
        ctx.addIssue({
          code: "custom",
          message: "Неизвестное значение нельзя подтвердить",
        });
      if (
        (field.status === "not_published" ||
          field.status === "not_applicable") &&
        factValue !== null
      )
        ctx.addIssue({
          code: "custom",
          message: "Значение должно оставаться неизвестным",
        });
    });
const numberFact = sourcedSchema(z.number().nonnegative());
const placesFact = sourcedSchema(z.number().int().nonnegative());
const stringFact = sourcedSchema(z.string());
const booleanFact = sourcedSchema(z.boolean());
const assetUrl = z.union([
  url,
  z.string().regex(/^\/university-logos\/[a-zA-Z0-9/_\-.]+$/),
]);
const slug = text.regex(/^[a-z0-9][a-z0-9-]*$/);
const trust = z
  .object({
    dataYear: z.number().int(),
    status,
    completeness: z.number().min(0).max(100),
    checkedAt: date,
    checkedBy: text,
    nextReviewAt: date.optional(),
    sourceName: text,
    sourceDocumentTitle: z.string().optional(),
    sourcePage: z.number().int().optional(),
    sourceSection: z.string().optional(),
    note: z.string().optional(),
  })
  .strict();
const program = z
  .object({
    id: text,
    slug,
    universitySlug: slug,
    university: text,
    universityShort: text,
    code: text,
    title: text,
    level: z.enum(["Бакалавриат", "Специалитет"]),
    form: z.enum(["Очная", "Очно-заочная", "Заочная"]),
    duration: text,
    durationValue: stringFact.optional(),
    admissionsContact: z
      .object({
        address: stringFact,
        phone: stringFact,
        email: stringFact,
        website: sourcedSchema(url),
      })
      .optional(),
    faculty: z.string().nullable(),
    campus: z.string().nullable(),
    language: text,
    subjects: z.array(text),
    examRequirements: z.array(
      z
        .object({
          id: text,
          subjects: z.array(text).min(1),
          minimum: numberFact,
          subjectMinimums: z.record(z.string(), numberFact).optional(),
          required: z.boolean(),
          label: text,
        })
        .strict(),
    ),
    passingScore: z.number().nullable(),
    passingScoreValue: numberFact,
    passingScoreExamScale: z.number().nullable().optional(),
    previousScores: z.array(
      z
        .object({ year: z.number().int(), score: z.number().nullable() })
        .strict(),
    ),
    passingHistory: z.array(numberFact),
    placesHistory: z.array(placesFact),
    tuitionHistory: z.array(numberFact),
    competitionHistory: z.array(numberFact),
    minScore: z.number().nullable(),
    budgetPlaces: z.number().nullable(),
    budgetPlacesValue: placesFact,
    paidPlaces: z.number().nullable(),
    paidPlacesValue: placesFact,
    tuition: z.number().nullable(),
    tuitionValue: numberFact,
    dvi: z.string().nullable(),
    dviValue: stringFact,
    dviMax: numberFact,
    dviMinimum: numberFact.optional(),
    individualAchievementsMax: numberFact,
    quotas: z
      .object({
        special: placesFact,
        separate: placesFact,
        target: placesFact,
        general: placesFact,
      })
      .strict(),
    hostel: booleanFact,
    militaryCenter: booleanFact,
    sourceUrl: url,
    admissionsUrl: url,
    updatedAt: text,
    verified: z.boolean(),
    trust,
    tags: z.array(text),
  })
  .strict();
const university = z
  .object({
    id: text,
    slug,
    shortName: text,
    name: text,
    color: text,
    description: z.string(),
    city: text,
    address: z.string(),
    website: url,
    programsCount: z.number().int().nonnegative(),
    logoUrl: assetUrl.optional(),
    logoBackground: z.string().optional(),
    logoSourceUrl: url,
    militaryCenter: z.boolean().nullable(),
    militaryCenterSourceUrl: url.optional(),
    admissionsUrl: url.optional(),
    admissionsPhone: z.string().optional(),
    admissionsEmail: z.string().optional(),
    foundedYear: z.number().optional(),
    dormitoriesCount: z.number().optional(),
    faculties: z.array(z.string()).optional(),
    factsSourceUrl: url.optional(),
    directory: z
      .object({
        monitoringId: text,
        sourceUrl: url,
        sourceYear: z.number().int(),
        checkedAt: date,
        ownership: z.enum(["state", "private"]),
        kind: z.enum(["university", "branch"]),
        legalName: text,
        authority: z.string(),
        websiteSourceUrl: url,
        addressSourceUrl: url,
        logoAssetSourceUrl: url.optional(),
        logoCheckedAt: date.optional(),
        logoSha256: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .optional(),
        note: z.string(),
      })
      .strict()
      .optional(),
  })
  .strict();
const universityFact = z
  .object({
    universitySlug: slug,
    facts: z
      .object({
        website: sourcedSchema(url),
        logoUrl: sourcedSchema(assetUrl),
        address: stringFact,
        dormitoryCount: placesFact,
        militaryCenter: booleanFact,
      })
      .strict(),
    campuses: z.array(
      z.object({ id: text, name: text, address: stringFact }).strict(),
    ),
  })
  .strict();
const directoryField = z
  .object({
    value: z.string(),
    sourceUrl: url,
    sourceYear: z.number().int(),
    checkedAt: date,
    sourceSha256: text.regex(/^[a-f0-9]{64}$/),
  })
  .strict();
const details = z
  .object({
    universitySlug: slug,
    educationAreas: z.array(
      z
        .object({
          code: text,
          title: text,
          sourceUrl: url,
          sourceYear: z.number().int(),
          checkedAt: date,
        })
        .strict(),
    ),
    fields: z
      .object({
        fullName: directoryField.optional(),
        shortName: directoryField.optional(),
        regDate: directoryField.optional(),
        address: directoryField.optional(),
        telephone: directoryField.optional(),
        email: directoryField.optional(),
        hostelInfo: directoryField.optional(),
        admissionsUrl: directoryField.optional(),
      })
      .strict(),
    licenseRegistry: z
      .object({ value: text, checkedAt: date, note: text })
      .strict(),
    licenseExtract: z
      .object({
        number: text,
        statusAsPublished: text,
        asOf: date,
        sourceUrl: url,
        checkedAt: date,
        sourceKind: text,
        sourceSha256: z.string().optional(),
      })
      .strict()
      .nullable(),
    documents: z.array(
      z.object({ label: text, kind: z.string(), url, pageUrl: url }).strict(),
    ),
    offerings: z.array(
      z
        .object({
          id: text,
          code: text,
          title: text,
          profile: z.string().nullable(),
          level: text,
          forms: z.string().nullable(),
          duration: z.string().nullable(),
          admissionsStatus: text,
          sourceUrl: url,
          sourceYear: z.number().int().nullable(),
          checkedAt: date,
          sourceSha256: text.regex(/^[a-f0-9]{64}$/),
          sourceSection: z.string().optional(),
        })
        .strict(),
    ),
  })
  .strict();
const campaignFact = <T extends z.ZodType>(value: T) =>
  z
    .object({
      value: value.nullable(),
      source: z.string().nullable(),
      section: z.string(),
    })
    .strict();
const campaign = z
  .object({
    universitySlug: slug,
    year: z.number().int(),
    campus: text,
    admissionsUrl: url,
    sources: z.record(
      text,
      z
        .object({
          url,
          title: text,
          kind: z.enum(["pdf", "docx"]),
          checkedAt: date,
          sha256: text.regex(/^[a-f0-9]{64}$/),
        })
        .strict(),
    ),
    groups: z.array(
      z
        .object({
          id: text,
          code: text,
          title: text,
          form: text,
          sharedPlaces: z.boolean(),
          profiles: z.array(
            z.object({ title: text, exams: z.array(text) }).strict(),
          ),
          duration: campaignFact(z.string()),
          budgetPlaces: campaignFact(z.number()),
          paidPlaces: campaignFact(z.number()),
          tuition: campaignFact(z.number()),
        })
        .strict(),
    ),
    examMinimums: z.array(
      z.object({ title: text, minimum: z.number(), source: text }).strict(),
    ),
    mainApplicationPeriod: z
      .object({ opens: date, closes: date, source: text, section: text })
      .strict(),
    notes: z.array(text),
  })
  .strict();
const snapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    programs: z.array(program),
    universities: z.array(university).min(1),
    universityFacts: z.array(universityFact),
    directoryDetails: z.array(details),
    admissionCampaigns: z.array(campaign),
  })
  .strict();

export function parseCatalog(input: unknown): CatalogSnapshot {
  const result = snapshotSchema.safeParse(input);
  if (!result.success)
    throw new CatalogError(
      result.error.issues
        .slice(0, 12)
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; "),
    );
  const snapshot = result.data as CatalogSnapshot;
  const errors: string[] = [];
  const universitySlugs = new Set(snapshot.universities.map((row) => row.slug));
  const unique = (values: string[], label: string) => {
    if (new Set(values).size !== values.length) errors.push(`Дубли: ${label}`);
  };
  unique(
    snapshot.universities.map((row) => row.slug),
    "вузы",
  );
  unique(
    snapshot.universities.map((row) => row.id),
    "ID вузов",
  );
  unique(
    snapshot.programs.map((row) => row.slug),
    "программы",
  );
  unique(
    snapshot.programs.map((row) => row.id),
    "ID программ",
  );
  const official = (
    universitySlug: string,
    sourceUrl: string,
    directory = false,
  ) => {
    if (
      directory &&
      repositoryDirectorySources.get(universitySlug)?.has(sourceUrl)
    )
      return;
    const adapter = getUniversityAdapter(universitySlug);
    if (!adapter) {
      errors.push(`Нет адаптера: ${universitySlug}`);
      return;
    }
    try {
      assertOfficialSource(adapter, {
        url: sourceUrl,
        category: "programs",
        title: "Проверка",
        year: 2026,
        format: "html",
      });
    } catch {
      errors.push(`Неофициальный источник: ${sourceUrl}`);
    }
  };
  const visitSources = (
    value: unknown,
    universitySlug: string,
    directory = false,
  ) => {
    if (!value || typeof value !== "object") return;
    const row = value as Record<string, unknown>;
    if (typeof row.sourceUrl === "string")
      official(universitySlug, row.sourceUrl, directory);
    for (const child of Object.values(row))
      visitSources(child, universitySlug, directory);
  };
  for (const row of snapshot.programs) {
    if (!universitySlugs.has(row.universitySlug))
      errors.push(`Вуз программы не найден: ${row.slug}`);
    visitSources(row, row.universitySlug);
    for (const [value, fact] of [
      [row.budgetPlaces, row.budgetPlacesValue],
      [row.paidPlaces, row.paidPlacesValue],
      [row.tuition, row.tuitionValue],
      [row.passingScore, row.passingScoreValue],
    ] as const) {
      if (value !== (fact.status === "verified" ? fact.value : null))
        errors.push(`Несогласованное публичное значение: ${row.slug}`);
    }
    const quotas = Object.values(row.quotas);
    if (
      row.budgetPlaces !== null &&
      quotas.every((fact) => fact.status === "verified") &&
      quotas.reduce((sum, fact) => sum + (fact.value ?? 0), 0) >
        row.budgetPlaces
    )
      errors.push(`Сумма квот превышает места: ${row.slug}`);
    for (const requirement of row.examRequirements) {
      for (const minimum of Object.values(
        requirement.subjectMinimums ?? { all: requirement.minimum },
      ))
        if (minimum.value !== null && minimum.value > 100)
          errors.push(`Минимум экзамена выше 100: ${row.slug}`);
    }
  }
  for (const collection of [
    snapshot.universityFacts,
    snapshot.directoryDetails,
    snapshot.admissionCampaigns,
  ]) {
    unique(
      collection.map((row) => row.universitySlug),
      "профили/кампании",
    );
    for (const row of collection)
      if (!universitySlugs.has(row.universitySlug))
        errors.push(`Неизвестный вуз: ${row.universitySlug}`);
  }
  if (snapshot.universityFacts.length !== snapshot.universities.length)
    errors.push("Для каждого вуза нужен профиль источников");
  for (const row of snapshot.universityFacts)
    errors.push(...validateUniversityFactProfile(row).errors);
  for (const row of snapshot.directoryDetails) {
    visitSources(row, row.universitySlug, true);
    if (
      row.fields.admissionsUrl &&
      !url.safeParse(row.fields.admissionsUrl.value).success
    )
      errors.push(
        `Некорректная ссылка приёмной комиссии: ${row.universitySlug}`,
      );
    for (const document of row.documents) {
      official(row.universitySlug, document.url, true);
      official(row.universitySlug, document.pageUrl, true);
    }
  }
  for (const row of snapshot.programs) {
    for (const fact of [
      row.budgetPlacesValue,
      row.paidPlacesValue,
      row.tuitionValue,
      row.dviValue,
      row.dviMax,
      row.individualAchievementsMax,
      ...Object.values(row.quotas),
    ])
      if (fact.year !== row.trust.dataYear)
        errors.push(`Смешаны кампании: ${row.slug}`);
    for (const fact of [row.passingScoreValue, ...row.passingHistory])
      if (fact.value !== null && fact.value > 510)
        errors.push(`Недопустимый итоговый балл: ${row.slug}`);
  }
  for (const row of snapshot.admissionCampaigns) {
    errors.push(...validateAdmissionCampaign(row));
    Object.values(row.sources).forEach((source) =>
      official(row.universitySlug, source.url),
    );
  }
  if (errors.length) throw new CatalogError(errors.slice(0, 20).join("; "));
  return snapshot;
}
