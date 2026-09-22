import { describe, expect, it } from "vitest";
import { validAggregateScore } from "./score-range";

describe("aggregate score plausibility", () => {
  it("accepts historical five-exam totals without imposing a four-exam scale", () => {
    expect(validAggregateScore(473)).toBe(true);
    expect(validAggregateScore(510)).toBe(true);
  });
  it("rejects corrupt values", () => {
    for (const value of [-1, 511, Infinity, NaN])
      expect(validAggregateScore(value)).toBe(false);
  });
});
