export type SourceCategory =
  | "programs"
  | "rules"
  | "places"
  | "tuition"
  | "results"
  | "exams"
  | "facts"
  | "logos"
  | "campuses";

export type OfficialSource = {
  category: SourceCategory;
  url: string;
  title: string;
  year: number;
  format: "html" | "pdf" | "xlsx" | "csv" | "docx";
  locator?: string;
};

export type UniversityAdapter = {
  slug: string;
  name: string;
  officialDomains: string[];
  sources: OfficialSource[];
  parse: (
    content: string,
    source: OfficialSource,
  ) => {
    source: OfficialSource;
    markers: string[];
    requiresReview: boolean;
    parserVersion: string;
    extractedFacts: number;
  };
};

export function createUniversityAdapter(
  config: Omit<UniversityAdapter, "parse"> & { markers: string[] },
): UniversityAdapter {
  return {
    ...config,
    parse(content, source) {
      const normalized = content.replace(/\s+/g, " ").toLowerCase();
      const present = config.markers.filter((marker) =>
        normalized.includes(marker.toLowerCase()),
      );
      // Detection is not extraction or verification. A matching word cannot approve admissions data.
      return {
        source,
        markers: present,
        requiresReview: true,
        parserVersion: "source-detection-v1",
        extractedFacts: 0,
      };
    },
  };
}

export function assertOfficialSource(
  adapter: UniversityAdapter,
  source: OfficialSource,
) {
  const hostname = new URL(source.url).hostname.toLowerCase();
  if (
    !adapter.officialDomains.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    )
  ) {
    throw new Error(
      `${adapter.slug}: URL ${source.url} не принадлежит реестру официальных доменов`,
    );
  }
}

export function assertAdapterCoverage(
  adapters: readonly UniversityAdapter[],
  catalogSlugs: readonly string[],
) {
  const catalog = new Set(catalogSlugs);
  const counts = new Map<string, number>();
  for (const adapter of adapters)
    counts.set(adapter.slug, (counts.get(adapter.slug) ?? 0) + 1);

  const missing = [...catalog].filter((slug) => !counts.has(slug)).sort();
  const orphaned = [...counts.keys()]
    .filter((slug) => !catalog.has(slug))
    .sort();
  const duplicated = [...counts]
    .filter(([, count]) => count > 1)
    .map(([slug]) => slug)
    .sort();
  const problems = [
    missing.length ? `нет адаптера: ${missing.join(", ")}` : null,
    orphaned.length ? `адаптер без вуза: ${orphaned.join(", ")}` : null,
    duplicated.length ? `дубли адаптеров: ${duplicated.join(", ")}` : null,
  ].filter(Boolean);

  if (problems.length)
    throw new Error(
      `Некорректный реестр официальных источников — ${problems.join("; ")}`,
    );
}
