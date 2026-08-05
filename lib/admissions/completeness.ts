import type { Program } from "@/lib/data";
import type { DataStatus, SourcedValue } from "./types";

export type CompletenessResult = {
  percent: number;
  earned: number;
  total: number;
  missing: string[];
};

const usable = <T,>(field: SourcedValue<T>) => field.status === "verified" || field.status === "not_applicable";

export function calculateCompleteness(program: Program): CompletenessResult {
  const checks: Array<[string, number, boolean]> = [
    ["идентичность программы", 10, Boolean(program.code && program.title && program.university)],
    ["форма и продолжительность", 8, Boolean(program.form && program.duration)],
    ["вступительные испытания", 16, program.examRequirements.length > 0 && program.examRequirements.every((item) => usable(item.minimum))],
    ["проходной балл", 14, usable(program.passingScoreValue)],
    ["бюджетные места", 10, usable(program.budgetPlacesValue)],
    ["платные места", 8, usable(program.paidPlacesValue)],
    ["стоимость", 12, usable(program.tuitionValue)],
    ["ДВИ", 8, usable(program.dviValue) && usable(program.dviMax)],
    ["квоты", 8, Object.values(program.quotas).every(usable)],
    ["история", 6, program.passingHistory.length + program.placesHistory.length + program.tuitionHistory.length >= 3],
  ];
  const total = checks.reduce((sum, [, weight]) => sum + weight, 0);
  const earned = checks.reduce((sum, [, weight, complete]) => sum + (complete ? weight : 0), 0);
  return {
    percent: Math.round((earned / total) * 100),
    earned,
    total,
    missing: checks.filter(([, , complete]) => !complete).map(([label]) => label),
  };
}

export function statusSeverity(status: DataStatus): number {
  return ({ verified: 0, not_applicable: 0, pending_review: 1, not_published: 2, outdated: 3, conflicting_sources: 4 })[status];
}
