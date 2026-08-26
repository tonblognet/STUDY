import { describe, expect, it } from "vitest";
import { assertAdapterCoverage, assertOfficialSource } from "./adapter";
import { universityAdapters } from "../universities";
import { programs, universities } from "../../lib/data";

describe("адаптеры официальных источников", () => {
  it("покрывает отдельной конфигурацией каждый вуз публичного каталога", () => {
    expect(universityAdapters).toHaveLength(universities.length);
    expect(
      new Set(universityAdapters.map((adapter) => adapter.slug)).size,
    ).toBe(universities.length);
    expect(universityAdapters.map((adapter) => adapter.slug).sort()).toEqual(
      universities.map((university) => university.slug).sort(),
    );
  });

  it("принимает основной источник каждой программы только через реестр её вуза", () => {
    const adapters = new Map(
      universityAdapters.map((adapter) => [adapter.slug, adapter]),
    );

    for (const program of programs) {
      const adapter = adapters.get(program.universitySlug);
      expect(adapter, program.universitySlug).toBeDefined();
      expect(() =>
        assertOfficialSource(adapter!, {
          category: "programs",
          url: program.sourceUrl,
          title: program.title,
          year: program.trust.dataYear,
          format: program.sourceUrl.endsWith(".pdf") ? "pdf" : "html",
        }),
      ).not.toThrow();
    }
  });

  it("останавливает pipeline при пропущенном, лишнем или дублирующемся адаптере", () => {
    expect(() =>
      assertAdapterCoverage(
        universityAdapters,
        universities.map(({ slug }) => slug),
      ),
    ).not.toThrow();
    expect(() =>
      assertAdapterCoverage(
        universityAdapters.slice(1),
        universities.map(({ slug }) => slug),
      ),
    ).toThrow(/нет адаптера: hse/);
    expect(() =>
      assertAdapterCoverage(
        [...universityAdapters, universityAdapters[0]],
        universities.map(({ slug }) => slug),
      ),
    ).toThrow(/дубли адаптеров: hse/);
    expect(() =>
      assertAdapterCoverage(
        universityAdapters,
        universities.slice(1).map(({ slug }) => slug),
      ),
    ).toThrow(/адаптер без вуза: hse/);
  });

  for (const adapter of universityAdapters) {
    it(`${adapter.slug}: принимает только официальный домен и распознаёт маркеры`, () => {
      for (const source of adapter.sources)
        expect(() => assertOfficialSource(adapter, source)).not.toThrow();
      expect(() =>
        assertOfficialSource(adapter, {
          ...adapter.sources[0],
          url: "https://example.com/data.pdf",
        }),
      ).toThrow();
      const result = adapter.parse(
        `Документ ${adapter.sources[0].title} ${adapter.slug}`,
        adapter.sources[0],
      );
      expect(result.source.url).toBe(adapter.sources[0].url);
    });
  }
});
