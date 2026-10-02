import type { Program } from "@/lib/data";
import type { AdditionalExam, SourcedValue } from "./types";

export function isCurrentFact<T>(
  fact: SourcedValue<T> | undefined,
  year: number,
): fact is SourcedValue<T> & { value: T } {
  return (
    fact?.status === "verified" && fact.year === year && fact.value !== null
  );
}

export function additionalExamKey(
  program: Program,
  exam: AdditionalExam,
): string {
  return `${program.slug}:${exam.id}`;
}

export function getAdditionalExams(program: Program): AdditionalExam[] {
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
