import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { directoryDetails } from "../lib/university-directory-details";
import {
  aggregateStudyForms,
  normalizeProgramText,
} from "../lib/directory/study-forms";

/**
 * One-off cleanup of 25.11.2026: the /sveden/ crawl of 20 November produced
 * rows whose form cell lists several forms separated by spaces («Очная
 * Заочная»), while the same programme also exists as separate single-form
 * rows. The combined row adds nothing and duplicates the card. It is removed
 * only when every listed form already exists as its own row of the same
 * code, title and profile; the count stays in the file's issues.
 */
const DIR = "data-sources/russia";

const singleForms = new Map<string, Set<string>>();
for (const details of directoryDetails)
  for (const row of details.offerings) {
    const forms = normalizeProgramText(row.forms);
    if (aggregateStudyForms(row.forms)) continue;
    const key = [
      details.universitySlug,
      row.code,
      normalizeProgramText(row.title),
      normalizeProgramText(row.profile),
    ].join("|");
    singleForms.set(key, (singleForms.get(key) ?? new Set()).add(forms));
  }

async function main() {
  let removed = 0;
  for (const name of (await readdir(DIR)).filter((file) =>
    /^fill-.*\.json$/.test(file),
  )) {
    const file = path.join(DIR, name);
    const data = JSON.parse(await readFile(file, "utf8"));
    let fileRemoved = 0;
    for (const profile of data.profiles) {
      const before = profile.offerings.length;
      profile.offerings = profile.offerings.filter(
        (row: {
          code: string;
          title: string;
          profile: string | null;
          forms: string | null;
        }) => {
          const forms = aggregateStudyForms(row.forms);
          if (!forms) return true;
          const known = singleForms.get(
            [
              profile.universitySlug,
              row.code,
              normalizeProgramText(row.title),
              normalizeProgramText(row.profile),
            ].join("|"),
          );
          return !forms.every((form) => known?.has(form));
        },
      );
      const count = before - profile.offerings.length;
      if (count) {
        fileRemoved += count;
        data.issues.push({
          universitySlug: profile.universitySlug,
          kind: "aggregate_form_duplicates_removed",
          count,
          note: "Строки с несколькими формами в одной ячейке удалены 25.11.2026: каждая форма уже есть отдельной строкой той же программы.",
        });
      }
    }
    if (fileRemoved) {
      await writeFile(file, JSON.stringify(data, null, 2) + "\n");
      console.log(`${name}: −${fileRemoved}`);
      removed += fileRemoved;
    }
  }
  console.log(JSON.stringify({ removed }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
