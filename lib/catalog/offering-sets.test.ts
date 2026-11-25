import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { baselineCatalog } from "./baseline";
import {
  assertOfferingSet,
  catalogOfferingCount,
  externalizeOfferings,
  offeringSetDigest,
} from "./offering-sets";
import { parseCatalog } from "./schema";
import { storeOfferingSets } from "./service";
import { pathwayQuery, pathwaySearch, pathwayView } from "./pathway-view";
import { educationPathwayRows, offeringTrack } from "@/lib/education-pathways";
import type { CatalogSnapshot } from "./types";

const repositoryCatalog = baselineCatalog();

function scopedCatalog(...slugs: string[]): CatalogSnapshot {
  const scope = new Set(slugs);
  return structuredClone({
    schemaVersion: repositoryCatalog.schemaVersion,
    programs: repositoryCatalog.programs.filter((row) =>
      scope.has(row.universitySlug),
    ),
    universities: repositoryCatalog.universities.filter((row) =>
      scope.has(row.slug),
    ),
    universityFacts: repositoryCatalog.universityFacts.filter((row) =>
      scope.has(row.universitySlug),
    ),
    directoryDetails: repositoryCatalog.directoryDetails.filter((row) =>
      scope.has(row.universitySlug),
    ),
    admissionCampaigns: repositoryCatalog.admissionCampaigns.filter((row) =>
      scope.has(row.universitySlug),
    ),
  });
}

describe("listing sets outside the catalog payload (ADR 0006)", () => {
  it("moves listings into content-addressed sets and keeps HSE inline", () => {
    const snapshot = scopedCatalog("hse", "rudn", "academy-gps");
    const before = catalogOfferingCount(snapshot);
    const { snapshot: light, sets } = externalizeOfferings(snapshot);
    const rudn = light.directoryDetails.find(
      (row) => row.universitySlug === "rudn",
    )!;
    expect(rudn.offerings).toEqual([]);
    expect(rudn.offeringSet?.count).toBeGreaterThan(900);
    const hse = light.directoryDetails.find(
      (row) => row.universitySlug === "hse",
    )!;
    expect(hse.offeringSet).toBeUndefined();
    expect(hse.offerings.length).toBeGreaterThan(0);
    expect(catalogOfferingCount(light)).toBe(before);
    expect(sets.map((set) => set.universitySlug).sort()).toEqual([
      "academy-gps",
      "rudn",
    ]);
    // The light snapshot is a valid publication on its own.
    expect(() => parseCatalog(light)).not.toThrow();
    // Re-externalizing is a no-op: references pass through unchanged.
    expect(externalizeOfferings(light)).toEqual({ snapshot: light, sets: [] });
  });

  it("addresses a set by content, independent of key order, and detects tampering", () => {
    const offerings =
      scopedCatalog("academy-gps").directoryDetails[0].offerings;
    const reordered = offerings.map((row) =>
      Object.fromEntries(Object.entries(row).reverse()),
    ) as typeof offerings;
    const digest = offeringSetDigest(offerings);
    expect(offeringSetDigest(reordered)).toBe(digest);
    const ref = { digest, count: offerings.length };
    expect(assertOfferingSet(ref, reordered)).toBe(reordered);
    const changed = structuredClone(offerings);
    changed[0].title += " (изменено)";
    expect(() => assertOfferingSet(ref, changed)).toThrow(/не совпадает/);
    expect(() => assertOfferingSet(ref, offerings.slice(1))).toThrow();
  });

  it("rejects a publication that carries a listing both inline and as a set", () => {
    const { snapshot } = externalizeOfferings(scopedCatalog("rudn"));
    snapshot.directoryDetails[0].offerings = structuredClone(
      scopedCatalog("rudn").directoryDetails[0].offerings.slice(0, 1),
    );
    expect(() => parseCatalog(snapshot)).toThrow(/отдельным набором/);
  });

  it("stores each new set atomically with positions and tracks, reusing known digests", async () => {
    const { snapshot, sets } = externalizeOfferings(
      scopedCatalog("rudn", "academy-gps"),
    );
    const known = sets.find((set) => set.universitySlug === "academy-gps")!;
    const operations: unknown[][] = [];
    const db = {
      catalogOfferingSet: {
        findMany: vi.fn(async () => [{ digest: known.digest }]),
        create: vi.fn((args: unknown) => ({ kind: "set", args })),
      },
      catalogOffering: {
        createMany: vi.fn((args: unknown) => ({ kind: "rows", args })),
      },
      $transaction: vi.fn(async (batch: unknown[]) => {
        operations.push(batch);
      }),
    };
    await storeOfferingSets(db as unknown as PrismaClient, snapshot, sets);
    expect(operations).toHaveLength(1);
    const rows = db.catalogOffering.createMany.mock.calls[0][0] as {
      data: Array<{
        position: number;
        track: string | null;
        setDigest: string;
      }>;
    };
    const rudn = sets.find((set) => set.universitySlug === "rudn")!;
    expect(rows.data).toHaveLength(rudn.offerings.length);
    expect(rows.data.map((row) => row.position)).toEqual(
      rudn.offerings.map((_, index) => index),
    );
    expect(new Set(rows.data.map((row) => row.setDigest))).toEqual(
      new Set([rudn.digest]),
    );
    expect(rows.data.map((row) => row.track)).toEqual(
      rudn.offerings.map((offering) => offeringTrack(offering.level)),
    );
  });

  it("refuses a light import that references a set the database does not have", async () => {
    const { snapshot } = externalizeOfferings(scopedCatalog("rudn"));
    const db = {
      catalogOfferingSet: { findMany: vi.fn(async () => []) },
    };
    await expect(
      storeOfferingSets(db as unknown as PrismaClient, snapshot, []),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("server-side education track view (ADR 0006)", () => {
  it("builds the same rows from external listings as from inline ones", () => {
    const inline = scopedCatalog("rudn", "academy-gps");
    const { snapshot, sets } = externalizeOfferings(inline);
    const listings = sets.flatMap((set) =>
      set.offerings.map((offering) => ({
        universitySlug: set.universitySlug,
        offering,
      })),
    );
    expect(educationPathwayRows(snapshot, "master", listings)).toEqual(
      educationPathwayRows(inline, "master"),
    );
    expect(educationPathwayRows(snapshot, "master")).toEqual([]);
  });

  it("parses only known filter values and clamps the page size", () => {
    const query = pathwayQuery({
      q: " экономика ",
      funding: "free",
      year: "20x6",
      maxTuition: "-1",
      school: "9",
      limit: "100000",
    });
    expect(query).toMatchObject({
      query: "экономика",
      funding: "",
      year: "",
      maxTuition: "",
      schoolBase: "9",
      limit: 600,
    });
    expect(pathwayQuery({}).limit).toBe(12);
    expect(
      pathwaySearch("master", pathwayQuery({ q: "право" }), { limit: "36" }),
    ).toBe("?track=master&q=%D0%BF%D1%80%D0%B0%D0%B2%D0%BE&limit=36");
  });

  it("returns one page, the totals and options scoped to the selected university", () => {
    const inline = scopedCatalog("rudn", "academy-gps");
    const rows = educationPathwayRows(inline, "master");
    const all = pathwayView(rows, pathwayQuery({}));
    expect(all.rows).toHaveLength(Math.min(12, rows.length));
    expect(all.total).toBe(rows.length);
    expect(all.matched).toBe(rows.length);
    expect(all.options.universities.map(([slug]) => slug).sort()).toEqual(
      [...new Set(rows.map((row) => row.universitySlug))].sort(),
    );
    const scoped = pathwayView(
      rows,
      pathwayQuery({ university: "academy-gps", limit: "600" }),
    );
    expect(
      scoped.rows.every((row) => row.universitySlug === "academy-gps"),
    ).toBe(true);
    expect(scoped.matched).toBe(
      rows.filter((row) => row.universitySlug === "academy-gps").length,
    );
  });
});
