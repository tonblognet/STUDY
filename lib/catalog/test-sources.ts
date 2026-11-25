import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import {
  GENERATED_CATALOG_DIR,
  registerDirectorySources,
  type DirectorySources,
} from "./directory-sources";

/**
 * Vitest setup (ADR 0006). Every test file needs the reviewed directory
 * sources; loading the whole repository evidence for each of them is slow,
 * so a generated summary is reused when it is newer than every data file.
 * Otherwise the summary is computed from the repository as before.
 */
function newestDataChange(): number {
  let newest = statSync(
    path.join(process.cwd(), "lib", "university-directory-details.ts"),
  ).mtimeMs;
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.name.endsWith(".json"))
        newest = Math.max(newest, statSync(target).mtimeMs);
    }
  };
  visit(path.join(process.cwd(), "data-sources"));
  return newest;
}

const summary = path.join(GENERATED_CATALOG_DIR, "directory-sources.json");
if (existsSync(summary) && statSync(summary).mtimeMs > newestDataChange()) {
  registerDirectorySources(
    JSON.parse(readFileSync(summary, "utf8")) as DirectorySources,
  );
} else {
  await import("./repository-sources");
}
