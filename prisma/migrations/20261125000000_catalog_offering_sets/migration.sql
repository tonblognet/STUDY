-- Directory listings move out of catalog payloads into content-addressed sets (ADR 0006).
CREATE TABLE "CatalogOfferingSet" (
  "digest" TEXT NOT NULL,
  "universitySlug" TEXT NOT NULL,
  "count" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CatalogOfferingSet_pkey" PRIMARY KEY ("digest"),
  CONSTRAINT "CatalogOfferingSet_digest_format" CHECK ("digest" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "CatalogOfferingSet_count_positive" CHECK ("count" > 0)
);
CREATE INDEX "CatalogOfferingSet_universitySlug_idx" ON "CatalogOfferingSet"("universitySlug");

CREATE TABLE "CatalogOffering" (
  "setDigest" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "offeringId" TEXT NOT NULL,
  "track" TEXT,
  "data" JSONB NOT NULL,
  CONSTRAINT "CatalogOffering_pkey" PRIMARY KEY ("setDigest", "position"),
  CONSTRAINT "CatalogOffering_setDigest_fkey" FOREIGN KEY ("setDigest") REFERENCES "CatalogOfferingSet"("digest") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "CatalogOffering_track_setDigest_idx" ON "CatalogOffering"("track", "setDigest");

-- A set is content-addressed: once written it is never changed or removed,
-- because published revisions keep referencing it.
CREATE FUNCTION protect_catalog_offering_sets() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Catalog listing sets are immutable';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "CatalogOfferingSet_immutable" BEFORE UPDATE OR DELETE ON "CatalogOfferingSet"
  FOR EACH ROW EXECUTE FUNCTION protect_catalog_offering_sets();
CREATE TRIGGER "CatalogOffering_immutable" BEFORE UPDATE OR DELETE ON "CatalogOffering"
  FOR EACH ROW EXECUTE FUNCTION protect_catalog_offering_sets();
