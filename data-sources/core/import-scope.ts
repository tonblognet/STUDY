import type { UniversityAdapter } from "./adapter";
import type { UniversityFactProfile } from "../../lib/university-facts";

/** A university can be imported before its program catalog is populated. */
export function universityImportScope(
  adapters: readonly Pick<UniversityAdapter, "slug">[],
  profiles: readonly UniversityFactProfile[],
): UniversityFactProfile[] {
  const selected = new Set(adapters.map(({ slug }) => slug));
  return profiles.filter(({ universitySlug }) => selected.has(universitySlug));
}
