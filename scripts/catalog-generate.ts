import "../lib/catalog/repository-sources";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { baselineCatalog } from "../lib/catalog/baseline";
import { catalogChecksum } from "../lib/catalog/diff";
import {
  GENERATED_CATALOG_DIR,
  summarizeDirectorySources,
} from "../lib/catalog/directory-sources";
import {
  externalizeOfferings,
  type TrackListing,
} from "../lib/catalog/offering-sets";
import { parseCatalog } from "../lib/catalog/schema";
import { offeringTrack } from "../lib/education-pathways";
import { directoryDetails } from "../lib/university-directory-details";

/**
 * Prepares the repository catalog for runtime reading (ADR 0006):
 *   catalog.json               light snapshot, listings referenced by digest
 *   offerings/<digest>.json    one immutable listing set per university
 *   tracks/<track>.json        listings of one education track, for search
 *   directory-sources.json     reviewed source summary for validation
 *   manifest.json              counts and checksums of this generation
 * Runtime pages read these files lazily instead of bundling the evidence.
 */
async function writeJson(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value));
}

async function main() {
  const started = Date.now();
  const repository = baselineCatalog();
  const { snapshot, sets } = externalizeOfferings(repository);
  parseCatalog(snapshot);

  const offeringDir = path.join(GENERATED_CATALOG_DIR, "offerings");
  await mkdir(offeringDir, { recursive: true });
  const wanted = new Set(sets.map((set) => `${set.digest}.json`));
  const present = new Set(await readdir(offeringDir));
  for (const name of present)
    if (!wanted.has(name)) await rm(path.join(offeringDir, name));
  for (const set of sets)
    if (!present.has(`${set.digest}.json`))
      await writeJson(
        path.join(offeringDir, `${set.digest}.json`),
        set.offerings,
      );

  const tracks = new Map<string, TrackListing[]>();
  for (const set of sets)
    for (const offering of set.offerings) {
      const track = offeringTrack(offering.level);
      if (!track) continue;
      tracks.set(track, [
        ...(tracks.get(track) ?? []),
        { universitySlug: set.universitySlug, offering },
      ]);
    }
  for (const track of ["master", "aspirantura", "doctorate", "college"])
    await writeJson(
      path.join(GENERATED_CATALOG_DIR, "tracks", `${track}.json`),
      tracks.get(track) ?? [],
    );

  await writeJson(
    path.join(GENERATED_CATALOG_DIR, "directory-sources.json"),
    summarizeDirectorySources(directoryDetails),
  );
  // Written last: readers treat catalog.json as the generation's commit point.
  await writeJson(path.join(GENERATED_CATALOG_DIR, "catalog.json"), snapshot);
  const manifest = {
    generatedAt: new Date().toISOString(),
    checksum: catalogChecksum(snapshot),
    universities: snapshot.universities.length,
    offeringSets: sets.length,
    offerings: sets.reduce((sum, set) => sum + set.offerings.length, 0),
    tracks: Object.fromEntries(
      [...tracks].map(([track, rows]) => [track, rows.length]),
    ),
  };
  await writeJson(path.join(GENERATED_CATALOG_DIR, "manifest.json"), manifest);
  console.log(
    JSON.stringify({ ...manifest, seconds: (Date.now() - started) / 1000 }),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
