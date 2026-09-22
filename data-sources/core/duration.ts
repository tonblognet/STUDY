import type { Program } from "@/lib/data";

export function programDurationMonths(
  program: Pick<Program, "duration" | "durationValue">,
): number | null {
  if (program.durationValue && program.durationValue.status !== "verified")
    return null;
  const match = program.duration.match(
    /^(\d+)(?:[.,](\d+))?\s*(?:год|года|лет)(?:\s+(\d+)\s*(?:месяц|месяца|месяцев))?$/,
  );
  if (!match) return null;
  const months =
    Number(`${match[1]}.${match[2] ?? 0}`) * 12 + Number(match[3] ?? 0);
  return Number.isInteger(months) && months >= 6 && months <= 120
    ? months
    : null;
}
