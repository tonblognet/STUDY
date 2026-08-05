export type SourceCategory = "programs" | "rules" | "places" | "tuition" | "results" | "exams";

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
  parse: (content: string, source: OfficialSource) => { source: OfficialSource; markers: string[]; requiresReview: boolean };
};

export function createUniversityAdapter(config: Omit<UniversityAdapter, "parse"> & { markers: string[] }): UniversityAdapter {
  return {
    ...config,
    parse(content, source) {
      const normalized = content.replace(/\s+/g, " ").toLowerCase();
      const present = config.markers.filter((marker) => normalized.includes(marker.toLowerCase()));
      return { source, markers: present, requiresReview: present.length === 0 };
    },
  };
}

export function assertOfficialSource(adapter: UniversityAdapter, source: OfficialSource) {
  const hostname = new URL(source.url).hostname.toLowerCase();
  if (!adapter.officialDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))) {
    throw new Error(`${adapter.slug}: URL ${source.url} не принадлежит реестру официальных доменов`);
  }
}
