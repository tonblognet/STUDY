import type { Program } from "@/lib/data";
import type { AdditionalExam, FactValue, SourcedValue } from "./types";

export function isCurrentFact<T extends FactValue<unknown>>(
  fact: T | undefined,
  year: number,
): fact is T & { value: NonNullable<T["value"]> } {
  return (
    fact?.status === "verified" && fact.year === year && fact.value !== null
  );
}

export function additionalExamKey(
  program: Pick<Program, "slug">,
  exam: Pick<AdditionalExam, "id">,
): string {
  return `${program.slug}:${exam.id}`;
}

export type ExamFact<T> = FactValue<T> & Pick<SourcedValue<T>, "sourceUrl">;

type ExamInput = {
  id: string;
  title: ExamFact<string>;
  minimum: ExamFact<number>;
  maximum: ExamFact<number>;
};

export type AdditionalExamProgram = {
  dviValue: ExamFact<string>;
  dviMax: ExamFact<number>;
  dviMinimum?: ExamFact<number>;
  additionalExams?: ExamInput[];
};

export function getAdditionalExams(
  program: AdditionalExamProgram,
): ExamInput[] {
  if (program.additionalExams !== undefined) return program.additionalExams;
  if (!program.dviValue.value) return [];
  return [
    {
      id: "dvi",
      title: program.dviValue,
      minimum: program.dviMinimum ?? {
        ...program.dviMax,
        value: null,
        status: "pending_review",
      },
      maximum: program.dviMax,
    },
  ];
}
