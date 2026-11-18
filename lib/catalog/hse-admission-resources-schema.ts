import { z } from "zod";
import type { SourcedValue } from "@/lib/admissions/types";

const text = z
  .string()
  .refine((value) => value.trim().length > 0, "Пустой текст");
const year = z.number().int().min(1900).max(2200);
const date = text.refine(
  (value) => Number.isFinite(Date.parse(value)),
  "Некорректная дата",
);
const officialUrl = z.url().refine((value) => {
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      (url.hostname === "hse.ru" || url.hostname.endsWith(".hse.ru"))
    );
  } catch {
    return false;
  }
}, "Нужен официальный HTTP(S) источник ВШЭ без учётных данных");
// Historical documents use several code standards; retain the published code.
const code = text;
const campusNames = {
  moscow: "Москва",
  spb: "Санкт-Петербург",
  nnov: "Нижний Новгород",
  perm: "Пермь",
} as const;
const campus = z.enum(["moscow", "spb", "nnov", "perm"]);
const campusName = z.enum([
  "Москва",
  "Санкт-Петербург",
  "Нижний Новгород",
  "Пермь",
]);
const source = z
  .object({
    url: officialUrl,
    finalUrl: officialUrl.optional(),
    resolvedUrl: officialUrl.optional(),
    retrievedAt: date.optional(),
    retrievedAtUtc: date.optional(),
    savedAtUtc: date.optional(),
    bytes: z.number().int().nonnegative().optional(),
    sha256: text.regex(/^[a-f0-9]{64}$/).optional(),
    httpStatus: z.number().int().min(100).max(599).optional(),
  })
  .passthrough();

function requireSource(
  sources: Record<string, unknown>,
  key: string,
  path: PropertyKey[],
  ctx: z.RefinementCtx,
) {
  if (!Object.hasOwn(sources, key))
    ctx.addIssue({
      code: "custom",
      path,
      message: `Источник не найден в resources.sources: ${key}`,
    });
}

function requireUnique(
  values: string[],
  path: PropertyKey[],
  ctx: z.RefinementCtx,
) {
  if (new Set(values).size !== values.length)
    ctx.addIssue({ code: "custom", path, message: "Дубли записей ресурса" });
}

/** Preserve archival metadata while validating its links and numeric values. */
function validateMetadata(
  value: unknown,
  path: PropertyKey[],
  ctx: z.RefinementCtx,
) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = [...path, Array.isArray(value) ? Number(key) : key];
    if (typeof child === "number" && !Number.isFinite(child))
      ctx.addIssue({
        code: "custom",
        path: childPath,
        message: "Число должно быть конечным",
      });
    if (/urls?$/i.test(key) && child !== null && child !== undefined) {
      const links = Array.isArray(child) ? child : [child];
      links.forEach((link, index) => {
        if (!officialUrl.safeParse(link).success)
          ctx.addIssue({
            code: "custom",
            path: Array.isArray(child) ? [...childPath, index] : childPath,
            message:
              "Нужен официальный HTTP(S) источник ВШЭ без учётных данных",
          });
      });
    }
    validateMetadata(child, childPath, ctx);
  }
}

function validateRecordSources(
  value: unknown,
  sources: Record<string, unknown>,
  path: PropertyKey[],
  ctx: z.RefinementCtx,
) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = [...path, Array.isArray(value) ? Number(key) : key];
    if (["source", "htmlSource", "identitySource"].includes(key)) {
      if (typeof child === "string")
        requireSource(sources, child, childPath, ctx);
    }
    validateRecordSources(child, sources, childPath, ctx);
  }
}

const score = z
  .object({
    value: z.number().positive().nullable(),
    status: z.enum(["verified", "unknown", "not_applicable", "pending_review"]),
    raw: z.string().optional(),
    rawPublishedValue: z.number().nonnegative().optional(),
    maximum: z.number().positive().nullable().optional(),
    source: text.optional(),
    rejectedDiagramValue: z.number().nonnegative().optional(),
    noteRu: z.string(),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    if ((value.status === "verified") !== (value.value !== null))
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message:
          "Неопубликованный или неподтверждённый проходной должен быть null",
      });
    if (
      value.value !== null &&
      value.maximum != null &&
      value.value > value.maximum
    )
      ctx.addIssue({
        code: "custom",
        path: ["maximum"],
        message: "Проходной выше шкалы исторического конкурса",
      });
  });

const archive = z
  .object({
    schemaVersion: z.number().int().positive().optional(),
    reviewedAtUtc: date.optional(),
    records: z.array(
      z
        .object({
          id: text,
          title: text,
          code: code.nullable(),
          codes: z.array(code).optional(),
          campus: campusName,
          year,
          programUrls: z.array(officialUrl),
          budget: score,
          paid: score,
          source: text,
          scopeNoteRu: z.string(),
          level: z
            .enum(["Бакалавриат и специалитет", "Магистратура"])
            .optional(),
          identityNoteRu: z.string().optional(),
          pageOneBased: z.number().int().positive().optional(),
          tableIndexZeroBased: z.number().int().nonnegative().optional(),
          rowIndexZeroBased: z.number().int().nonnegative().optional(),
          tableRowOneBased: z.number().int().positive().optional(),
          rowNumbersAsPublished: z
            .array(z.number().int().positive())
            .optional(),
          htmlSource: text.optional(),
          supportingSources: z
            .array(z.object({ source: text, locator: text }).passthrough())
            .optional(),
          identityCandidates2026: z
            .array(
              z
                .object({
                  title: text,
                  codes: z.array(code),
                  programUrls: z.array(officialUrl),
                  identitySource: text,
                  identityRowIndexZeroBased: z.number().int().nonnegative(),
                })
                .passthrough(),
            )
            .optional(),
        })
        .passthrough(),
    ),
    sources: z.record(text, source),
    knownConflicts: z.array(
      z
        .object({
          title: text,
          code,
          year,
          facultyUnassigned: z.number().nonnegative().optional(),
          central: z.number().nonnegative().optional(),
          faculty: z.number().nonnegative().optional(),
          noteRu: text,
          sourceUrls: z.array(officialUrl).min(2),
        })
        .passthrough(),
    ),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    requireUnique(
      value.records.map((record) => record.id),
      ["records"],
      ctx,
    );
    value.records.forEach((record, index) => {
      validateRecordSources(record, value.sources, ["records", index], ctx);
      if (record.codes) {
        requireUnique(record.codes, ["records", index, "codes"], ctx);
        if (
          record.code &&
          record.codes.length &&
          !record.codes.includes(record.code)
        )
          ctx.addIssue({
            code: "custom",
            path: ["records", index, "codes"],
            message:
              "Код исторической записи отсутствует в её группе направлений",
          });
      }
    });
  });

const event = z
  .object({
    event: z.enum([
      "applications_open",
      "budget_submission_ege_or_bvi",
      "budget_submission_internal_or_creative",
      "contract_submission_ege",
      "contract_submission_internal_or_creative",
      "budget_ranked_lists",
      "budget_priority_consent",
      "budget_general_consent",
      "budget_priority_enrollment_order",
      "budget_general_enrollment_order",
      "contract_conclusion_deadline",
      "contract_enrollment_deadline",
    ]),
    date: z.iso.date(),
    time: z
      .string()
      .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
      .nullable(),
    timeZone: z.literal("Europe/Moscow").nullable(),
    scope: text,
    sourceKey: text,
    locator: text,
  })
  .passthrough()
  .superRefine((value, ctx) => {
    if (value.time !== null && value.timeZone !== "Europe/Moscow")
      ctx.addIssue({
        code: "custom",
        path: ["timeZone"],
        message: "Для точного срока требуется часовой пояс",
      });
  });

const services = z
  .object({
    reviewedAtUtc: date,
    sources: z.record(text, source),
    campusAdmissionDeadlines: z
      .array(
        z
          .object({
            campus,
            campusName,
            admissionYear: year,
            deadlines: z.array(event).min(1),
          })
          .passthrough(),
      )
      .min(1),
    housing: z.array(
      z
        .object({
          campus,
          available: z.boolean(),
          sourceKey: text,
          contactSourceKey: text,
          contactUnit: text,
          phoneRaw: text,
          allocationRulesUrl: officialUrl,
          contactUrl: officialUrl.nullable().optional(),
          priceUrl: officialUrl.nullable(),
          sourceLocator: text,
          address: z.string().optional(),
          email: z.email().optional(),
        })
        .passthrough(),
    ),
    militaryTraining: z.array(
      z
        .object({
          campus,
          militaryTrainingPresent: z.boolean(),
          sourceKey: text,
          sourceLocator: text,
          address: text,
          phoneRaw: text,
          emails: z.array(z.email()),
          admissionUrl: officialUrl.nullable(),
        })
        .passthrough(),
    ),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    for (const key of [
      "campusAdmissionDeadlines",
      "housing",
      "militaryTraining",
    ] as const) {
      requireUnique(
        value[key].map((row) => row.campus),
        [key],
        ctx,
      );
      for (const expected of Object.keys(campusNames))
        if (!value[key].some((row) => row.campus === expected))
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: `Нет сведений для кампуса ${expected}`,
          });
    }
    value.campusAdmissionDeadlines.forEach((row, index) => {
      if (row.campusName !== campusNames[row.campus])
        ctx.addIssue({
          code: "custom",
          path: ["campusAdmissionDeadlines", index, "campusName"],
          message: "Название кампуса не соответствует его коду",
        });
      requireUnique(
        row.deadlines.map((deadline) => deadline.event),
        ["campusAdmissionDeadlines", index, "deadlines"],
        ctx,
      );
      row.deadlines.forEach((deadline, deadlineIndex) =>
        requireSource(
          value.sources,
          deadline.sourceKey,
          [
            "campusAdmissionDeadlines",
            index,
            "deadlines",
            deadlineIndex,
            "sourceKey",
          ],
          ctx,
        ),
      );
    });
    value.housing.forEach((row, index) => {
      requireSource(
        value.sources,
        row.sourceKey,
        ["housing", index, "sourceKey"],
        ctx,
      );
      requireSource(
        value.sources,
        row.contactSourceKey,
        ["housing", index, "contactSourceKey"],
        ctx,
      );
    });
    value.militaryTraining.forEach((row, index) =>
      requireSource(
        value.sources,
        row.sourceKey,
        ["militaryTraining", index, "sourceKey"],
        ctx,
      ),
    );
  });

function officialFact<T>(schema: z.ZodType<SourcedValue<T>>) {
  return schema.superRefine((value, ctx) => {
    if (!officialUrl.safeParse(value.sourceUrl).success)
      ctx.addIssue({
        code: "custom",
        path: ["sourceUrl"],
        message: "Неофициальный источник ВШЭ",
      });
  });
}

/** Reuse catalog fact validation without importing the parent schema or baseline. */
export function createHseAdmissionResourcesSchema(facts: {
  numberFact: z.ZodType<SourcedValue<number>>;
  placesFact: z.ZodType<SourcedValue<number>>;
  stringFact: z.ZodType<SourcedValue<string>>;
}) {
  const numberFact = officialFact(facts.numberFact);
  const placesFact = officialFact(facts.placesFact);
  const stringFact = officialFact(facts.stringFact);
  return z
    .object({
      masterTuition: z.array(
        z
          .object({
            title: text,
            code: text.regex(
              /^\d{2}\.\d{2}\.\d{2}(?:\s*\/\s*\d{2}\.\d{2}\.\d{2})*$/,
            ),
            campus: campusName,
            form: z.enum(["Очная", "Очно-заочная", "Заочная"]),
            tuition: numberFact,
            sourceUrl: officialUrl,
            programUrl: officialUrl.nullable(),
            budgetPlaces: placesFact,
            paidPlaces: placesFact,
            exams: stringFact,
            faculty: z.string().nullable(),
            duration: z.string().nullable(),
          })
          .strict(),
      ),
      archive,
      services,
      pathways: z
        .array(
          z
            .object({
              key: z.enum(["master", "aspirantura", "doctorate", "college"]),
              title: text,
              priorEducation: text,
              admissionBasis: text,
              dates: z.array(z.object({ label: text, year }).strict()),
              notes: z.array(text),
              sources: z
                .array(
                  z
                    .object({
                      id: text,
                      url: officialUrl,
                      title: text,
                      checkedAt: date,
                    })
                    .strict(),
                )
                .min(1),
            })
            .strict(),
        )
        .optional(),
    })
    .strict()
    .superRefine((value, ctx) => {
      validateMetadata(value, [], ctx);
      requireUnique(
        value.pathways?.map((context) => context.key) ?? [],
        ["pathways"],
        ctx,
      );
      requireUnique(
        value.masterTuition.map((row) =>
          JSON.stringify([row.title, row.code, row.campus, row.form]),
        ),
        ["masterTuition"],
        ctx,
      );
    });
}
