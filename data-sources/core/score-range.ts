// Plausibility guard for aggregate scores, not an admissions threshold.
// Historical MGU contests include five 100-point exams plus achievements.
export function validAggregateScore(value: number) {
  return Number.isFinite(value) && value >= 0 && value <= 510;
}
