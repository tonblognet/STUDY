import { describe, expect, it } from "vitest";
import { BaselineProbabilityEngine } from "@/lib/admissions/probability";

describe("baseline probability engine", () => {
  it("returns low confidence with no history", () => {
    const result = new BaselineProbabilityEngine().estimate({
      totalScore: 250,
      historicalCutoffs: [],
      budgetPlaces: null,
      currentPosition: null,
      daysToDeadline: null,
    });
    expect(result).toMatchObject({ probability: 0.5, confidence: "LOW" });
  });
  it("is deterministic and bounded", () => {
    const engine = new BaselineProbabilityEngine();
    const input = {
      totalScore: 275,
      historicalCutoffs: [250, 255, 260],
      budgetPlaces: 100,
      currentPosition: 80,
      daysToDeadline: 10,
    };
    const a = engine.estimate(input);
    expect(engine.estimate(input)).toEqual(a);
    expect(a.probability).toBeGreaterThanOrEqual(0);
    expect(a.probability).toBeLessThanOrEqual(1);
    expect(a.disclaimer).toContain("не гарантирует");
  });
});
