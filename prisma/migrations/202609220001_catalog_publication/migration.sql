CREATE TYPE "CatalogRevisionStatus" AS ENUM ('REVIEW', 'PUBLISHED', 'REJECTED');
CREATE TABLE "CatalogRevision" (
  "id" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "checksum" TEXT NOT NULL,
  "baseRevisionId" TEXT,
  "status" "CatalogRevisionStatus" NOT NULL DEFAULT 'REVIEW',
  "payload" JSONB NOT NULL,
  "changes" JSONB NOT NULL,
  "reason" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedBy" TEXT,
  "reviewNote" TEXT,
  "reviewedAt" TIMESTAMP(3),
  CONSTRAINT "CatalogRevision_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CatalogRevision_fingerprint_key" ON "CatalogRevision"("fingerprint");
CREATE INDEX "CatalogRevision_status_createdAt_idx" ON "CatalogRevision"("status", "createdAt");
CREATE TABLE "CatalogHead" (
  "id" TEXT NOT NULL DEFAULT 'public',
  "revisionId" TEXT,
  CONSTRAINT "CatalogHead_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CatalogHead_singleton" CHECK ("id" = 'public'),
  CONSTRAINT "CatalogHead_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "CatalogRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CatalogHead_revisionId_key" ON "CatalogHead"("revisionId");
INSERT INTO "CatalogHead" ("id") VALUES ('public');

-- Published payloads and their provenance are immutable, including through SQL.
CREATE FUNCTION protect_catalog_revision() RETURNS trigger AS $$
BEGIN
  IF OLD."status" <> 'REVIEW' OR
     NEW."payload" IS DISTINCT FROM OLD."payload" OR
     NEW."changes" IS DISTINCT FROM OLD."changes" OR
     NEW."checksum" IS DISTINCT FROM OLD."checksum" OR
     NEW."fingerprint" IS DISTINCT FROM OLD."fingerprint" OR
     NEW."baseRevisionId" IS DISTINCT FROM OLD."baseRevisionId" OR
     NEW."createdBy" IS DISTINCT FROM OLD."createdBy" OR
     NEW."createdAt" IS DISTINCT FROM OLD."createdAt" OR
     NEW."reason" IS DISTINCT FROM OLD."reason" THEN
    RAISE EXCEPTION 'Catalog revisions are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "CatalogRevision_immutable" BEFORE UPDATE ON "CatalogRevision"
  FOR EACH ROW EXECUTE FUNCTION protect_catalog_revision();
CREATE FUNCTION prevent_catalog_revision_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Catalog revision history cannot be deleted';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "CatalogRevision_no_delete" BEFORE DELETE ON "CatalogRevision"
  FOR EACH ROW EXECUTE FUNCTION prevent_catalog_revision_delete();
