import { describe, expect, it } from "vitest";
import { assertOfficialSource } from "./adapter";
import { universityAdapters } from "../universities";

describe("адаптеры официальных источников", () => {
  it("содержит отдельную конфигурацию для десяти вузов", () => {
    expect(universityAdapters).toHaveLength(10);
    expect(new Set(universityAdapters.map((adapter) => adapter.slug)).size).toBe(10);
  });

  for (const adapter of universityAdapters) {
    it(`${adapter.slug}: принимает только официальный домен и распознаёт маркеры`, () => {
      for (const source of adapter.sources) expect(() => assertOfficialSource(adapter, source)).not.toThrow();
      expect(() => assertOfficialSource(adapter, { ...adapter.sources[0], url: "https://example.com/data.pdf" })).toThrow();
      const result = adapter.parse(`Документ ${adapter.sources[0].title} ${adapter.slug}`, adapter.sources[0]);
      expect(result.source.url).toBe(adapter.sources[0].url);
    });
  }
});
