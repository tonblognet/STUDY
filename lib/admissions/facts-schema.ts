import { createHash } from "node:crypto";
import { z } from "zod";
import { admissionFactKinds, type AdmissionFact } from "./facts";

/** Server and script side of admission facts: validation and stable ids. */
const text = z.string().trim().min(1);
export const admissionFactSchema = z
  .object({
    id: z.string().regex(/^[a-f0-9]{16}$/),
    universitySlug: text,
    year: z.number().int().min(2000).max(2100),
    kind: z.enum(admissionFactKinds),
    funding: z.enum(["budget", "paid"]).nullable(),
    competition: text.nullable(),
    stage: text.nullable(),
    code: text.nullable(),
    label: text,
    form: text.nullable(),
    campus: text.nullable(),
    value: z.number().nonnegative().finite(),
    unit: z.enum(["points", "places", "rub"]),
    period: z.enum(["year", "semester"]).nullable(),
    note: text.nullable(),
    source: z
      .object({
        url: z.url(),
        checkedAt: text,
        sha256: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .nullable(),
        section: text.nullable(),
      })
      .strict(),
  })
  .strict()
  .superRefine((fact, context) => {
    const expected =
      fact.kind === "tuition"
        ? "rub"
        : fact.kind === "places"
          ? "places"
          : "points";
    if (fact.unit !== expected)
      context.addIssue({ code: "custom", message: `Единица ${fact.kind}` });
    if (fact.kind === "tuition" && fact.funding !== "paid")
      context.addIssue({
        code: "custom",
        message: "Цена — только для договора",
      });
    if (fact.kind !== "tuition" && fact.period !== null)
      context.addIssue({ code: "custom", message: "Период — только у цены" });
  });

export function admissionFactId(fact: Omit<AdmissionFact, "id">): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        fact.universitySlug,
        fact.year,
        fact.kind,
        fact.funding,
        fact.competition,
        fact.stage,
        fact.code,
        fact.label,
        fact.form,
        fact.campus,
        fact.value,
        fact.source.url,
        fact.source.section,
      ]),
    )
    .digest("hex")
    .slice(0, 16);
}
