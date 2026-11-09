import { z } from "zod";
export const trackerStages = [
  { id: "shortlist", label: "Выбираю" },
  { id: "documents", label: "Готовлю документы" },
  { id: "submitted", label: "Заявление подано" },
  { id: "ranked", label: "Слежу за конкурсом" },
  { id: "enrolled", label: "Зачислен" },
  { id: "withdrawn", label: "Отозвано" },
] as const;
export const trackerCreateSchema = z.object({
  programKey: z.string().min(1).max(100),
  admissionYear: z.number().int().min(2026).max(2100),
});
export const trackerUpdateSchema = z.object({
  id: z.string().cuid(),
  version: z.number().int().positive(),
  priority: z.number().int().min(1).max(200),
  stage: z.enum([
    "shortlist",
    "documents",
    "submitted",
    "ranked",
    "enrolled",
    "withdrawn",
  ]),
  documentsReady: z.boolean(),
  consentReady: z.boolean(),
  deadlineAt: z.string().datetime().nullable(),
  notes: z.string().trim().max(2000),
});
export type TrackerItem = z.infer<typeof trackerUpdateSchema> & {
  programKey: string;
  admissionYear: number;
  history: Array<{ at: string; action: string }>;
};
