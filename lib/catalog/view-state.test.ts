import { describe, expect, it } from "vitest";
import {
  decodeView,
  viewFromSearch,
  programViewSchema,
  universityViewSchema,
  matchViewSchema,
  initialView,
} from "./view-state";

describe("public filter persistence boundaries", () => {
  it("prepares the same validated state for server rendering and the browser", () => {
    const raw = initialView(programViewSchema, { q: "ВШЭ" });
    expect(decodeView(programViewSchema, raw).query).toBe("ВШЭ");
    expect(initialView(programViewSchema, { filters: "null" })).toBe(
      initialView(programViewSchema, {}),
    );
  });
  it("round-trips combined filters and pagination without personal data", () => {
    const state = programViewSchema.parse({
      query: "Экономика",
      university: "hse",
      onlyBudget: true,
      subjects: ["Математика"],
      maxScore: 280,
      sort: "price",
      limit: 48,
    });
    expect(decodeView(programViewSchema, JSON.stringify(state))).toEqual(state);
    expect(
      programViewSchema.parse({ ...state, scores: { math: 80 } }),
    ).not.toHaveProperty("scores");
  });
  it.each(["{", "null", "[]", "x".repeat(6001)])(
    "recovers malformed storage: %s",
    (raw) => {
      expect(decodeView(programViewSchema, raw)).toEqual(
        programViewSchema.parse({}),
      );
    },
  );
  it("rejects invalid fields while retaining valid filters", () => {
    const state = decodeView(
      programViewSchema,
      JSON.stringify({
        query: "МГУ",
        onlyBudget: "false",
        maxScore: -1,
        subjects: [1],
        limit: 99999,
        sort: "evil",
      }),
    );
    expect(state.query).toBe("МГУ");
    expect(state.onlyBudget).toBe(false);
    expect(state.maxScore).toBeNull();
    expect(state.limit).toBe(24);
    expect(state.subjects).toEqual([]);
  });
  it("explicit search and reset links override saved filters", () => {
    expect(viewFromSearch("?q=МГУ")).toBe(JSON.stringify({ query: "МГУ" }));
    expect(
      decodeView(programViewSchema, viewFromSearch("?filters={}")),
    ).toEqual(programViewSchema.parse({}));
    expect(viewFromSearch("?unrelated=1")).toBeNull();
  });
  it("keeps independent university and match filter contracts", () => {
    expect(
      decodeView(universityViewSchema, '{"ownership":"private","limit":48}')
        .ownership,
    ).toBe("private");
    expect(
      decodeView(matchViewSchema, '{"maxPrice":"-1","funding":"paid"}'),
    ).toMatchObject({ maxPrice: "", funding: "paid" });
    expect(
      decodeView(matchViewSchema, '{"quality":"not_applicable"}').quality,
    ).toBe("not_applicable");
  });
});
