type PublishedProgramIdentity = { id: string; slug: string };

export type TrackerProgramIdentity = {
  canonicalKey: string;
  aliases: string[];
};

/** Migration keys use slugs; earlier account clients also stored public IDs. */
export function getTrackerProgramIdentity(
  program: PublishedProgramIdentity,
  programs: readonly PublishedProgramIdentity[],
): TrackerProgramIdentity | null {
  const aliases = [...new Set([program.slug, program.id])];
  const ambiguous = programs.some(
    (other) =>
      (other.id !== program.id || other.slug !== program.slug) &&
      (aliases.includes(other.id) || aliases.includes(other.slug)),
  );
  return ambiguous ? null : { canonicalKey: program.slug, aliases };
}

/** A stored key must identify exactly one program across both namespaces. */
export function resolveTrackerProgramKey<T extends PublishedProgramIdentity>(
  key: string,
  programs: readonly T[],
): T | undefined {
  const matches = programs.filter(
    (program) => program.id === key || program.slug === key,
  );
  return matches.length === 1 ? matches[0] : undefined;
}

/** Reuse a stored record without rewriting or deleting either historical alias. */
export function preferredTrackerItem<T extends { programKey: string }>(
  items: readonly T[],
  identity: TrackerProgramIdentity,
): T | undefined {
  return (
    items.find((item) => item.programKey === identity.canonicalKey) ??
    items.find((item) => identity.aliases.includes(item.programKey))
  );
}
