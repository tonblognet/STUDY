export type ProbabilityInput = {
  totalScore: number;
  historicalCutoffs: number[];
  budgetPlaces: number | null;
  currentPosition: number | null;
  daysToDeadline: number | null;
};

export type ProbabilityEstimate = {
  probability: number;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  positiveFactors: string[];
  risks: string[];
  disclaimer: "Прогноз является оценкой и не гарантирует поступление.";
  modelVersion: string;
};

export interface AdmissionProbabilityEngine {
  estimate(input: ProbabilityInput): ProbabilityEstimate;
}

export class BaselineProbabilityEngine implements AdmissionProbabilityEngine {
  estimate(input: ProbabilityInput): ProbabilityEstimate {
    const cutoffs = input.historicalCutoffs.filter((value) =>
      Number.isFinite(value),
    );
    if (!cutoffs.length)
      return {
        probability: 0.5,
        confidence: "LOW",
        positiveFactors: [],
        risks: ["Недостаточно исторических данных"],
        disclaimer: "Прогноз является оценкой и не гарантирует поступление.",
        modelVersion: "baseline-v1",
      };
    const average =
      cutoffs.reduce((sum, value) => sum + value, 0) / cutoffs.length;
    const scoreSignal = 1 / (1 + Math.exp(-(input.totalScore - average) / 8));
    const positionSignal =
      input.currentPosition && input.budgetPlaces
        ? Math.max(0, Math.min(1, input.budgetPlaces / input.currentPosition))
        : 0.5;
    const probability =
      Math.round((scoreSignal * 0.7 + positionSignal * 0.3) * 100) / 100;
    return {
      probability,
      confidence:
        cutoffs.length >= 3 && input.currentPosition !== null
          ? "HIGH"
          : "MEDIUM",
      positiveFactors:
        input.totalScore >= average
          ? ["Баллы выше исторического ориентира"]
          : [],
      risks:
        input.daysToDeadline !== null && input.daysToDeadline < 3
          ? ["До дедлайна осталось мало времени"]
          : [],
      disclaimer: "Прогноз является оценкой и не гарантирует поступление.",
      modelVersion: "baseline-v1",
    };
  }
}
