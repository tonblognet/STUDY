import { z } from "zod";
export const legacyTrackerSchema = z
  .array(
    z.object({
      programId: z.string().min(1).max(100),
      priority: z.number().int().min(1).max(200),
      stage: z.enum([
        "shortlist",
        "documents",
        "submitted",
        "ranked",
        "enrolled",
      ]),
      documentsReady: z.boolean(),
      consentReady: z.boolean(),
    }),
  )
  .max(200);
export const legacyImportSchema = z.object({
  admissionYear: z.number().int().min(2026).max(2100),
  items: legacyTrackerSchema,
  confirmedOwner: z.literal(true),
});
