import { z } from "zod";
import { sourcedSchema } from "./schema";
import { CatalogError, type CatalogSnapshot } from "./types";
import { calculateCompleteness } from "@/lib/admissions/completeness";

export const programEditSchema = z
  .object({
    baseRevisionId: z.string().min(1),
    field: z.enum(["tuition", "budgetPlaces", "paidPlaces"]),
    fact: sourcedSchema(z.number().nonnegative()).refine(
      (fact) => Boolean(fact.sourceKind && fact.sourceSection?.trim()),
      "Нужны тип источника и раздел документа",
    ),
    reason: z.string().trim().min(10).max(2000),
  })
  .strict();

export function applyProgramEdit(
  snapshot: CatalogSnapshot,
  id: string,
  edit: z.infer<typeof programEditSchema>,
) {
  const next = structuredClone(snapshot);
  const program = next.programs.find(
    (item) => item.id === id || item.slug === id,
  );
  if (!program) throw new CatalogError("Программа не найдена", 404);
  if (edit.fact.year !== program.trust.dataYear)
    throw new CatalogError(
      "Год значения должен совпадать с кампанией программы",
    );
  if (
    edit.field !== "tuition" &&
    edit.fact.value !== null &&
    !Number.isInteger(edit.fact.value)
  )
    throw new CatalogError("Число мест должно быть целым");
  const factKey = {
    tuition: "tuitionValue",
    budgetPlaces: "budgetPlacesValue",
    paidPlaces: "paidPlacesValue",
  } as const;
  program[factKey[edit.field]] = edit.fact;
  program[edit.field] =
    edit.fact.status === "verified" ? edit.fact.value : null;
  program.updatedAt = edit.fact.checkedAt;
  program.trust.completeness = calculateCompleteness(program).percent;
  // A single corrected field cannot establish that the whole program is verified.
  program.trust.status = "pending_review";
  program.verified = false;
  return next;
}
