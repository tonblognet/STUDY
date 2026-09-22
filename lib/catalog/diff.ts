import { createHash } from "node:crypto";
import type { CatalogChange, CatalogSnapshot } from "./types";

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export function catalogChecksum(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function catalogDiff(
  before: CatalogSnapshot | null,
  after: CatalogSnapshot,
): CatalogChange[] {
  const changes: CatalogChange[] = [];
  function visit(left: unknown, right: unknown, path: string) {
    if (canonicalJson(left) === canonicalJson(right)) return;
    if (
      left &&
      right &&
      typeof left === "object" &&
      typeof right === "object" &&
      !Array.isArray(left) &&
      !Array.isArray(right)
    ) {
      const a = left as Record<string, unknown>,
        b = right as Record<string, unknown>;
      // Keep provenance attached to the fact being reviewed, even if only its URL changed.
      if (!("value" in a && ("sourceUrl" in a || "source" in a))) {
        for (const key of [
          ...new Set([...Object.keys(a), ...Object.keys(b)]),
        ].sort())
          visit(a[key], b[key], `${path}.${key}`);
        return;
      }
    }
    const numeric = (v: unknown) =>
      typeof v === "number"
        ? v
        : v &&
            typeof v === "object" &&
            "value" in v &&
            typeof v.value === "number"
          ? v.value
          : null;
    const x = numeric(left),
      y = numeric(right);
    changes.push({
      path,
      before: left ?? null,
      after: right ?? null,
      suspicious:
        right === undefined ||
        (x !== null &&
          y !== null &&
          x !== y &&
          (x === 0 || y === 0 || Math.max(x, y) / Math.min(x, y) >= 2)),
    });
  }
  for (const collection of [
    "programs",
    "universities",
    "universityFacts",
    "directoryDetails",
    "admissionCampaigns",
  ] as const) {
    const key = (item: unknown) => {
      const row = item as Record<string, unknown>;
      return String(row.slug ?? row.universitySlug);
    };
    const old = new Map(
      (before?.[collection] ?? []).map((row) => [key(row), row]),
    );
    const next = new Map(after[collection].map((row) => [key(row), row]));
    for (const id of [...new Set([...old.keys(), ...next.keys()])].sort())
      visit(old.get(id), next.get(id), `${collection}.${id}`);
  }
  return changes;
}
