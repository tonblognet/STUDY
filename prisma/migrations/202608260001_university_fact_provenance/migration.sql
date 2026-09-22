-- Store versioned university and campus facts with the same provenance
-- guarantees used for program metrics.
CREATE TABLE "UniversityFactValue" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "factKey" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "value" JSONB,
    "status" "DataValueStatus" NOT NULL,
    "sourceType" "SourceType" NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceDocumentTitle" TEXT,
    "sourcePage" INTEGER,
    "sourceSheet" TEXT,
    "sourceRange" TEXT,
    "sourceSection" TEXT,
    "retrievedAt" TIMESTAMP(3) NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "checkedBy" TEXT NOT NULL,
    "nextReviewAt" TIMESTAMP(3),
    "note" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "supersedesId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UniversityFactValue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UniversityFactValue_universityId_factKey_year_version_key"
ON "UniversityFactValue"("universityId", "factKey", "year", "version");

CREATE INDEX "UniversityFactValue_universityId_year_factKey_idx"
ON "UniversityFactValue"("universityId", "year", "factKey");

CREATE INDEX "UniversityFactValue_status_checkedAt_idx"
ON "UniversityFactValue"("status", "checkedAt");

ALTER TABLE "UniversityFactValue"
ADD CONSTRAINT "UniversityFactValue_universityId_fkey"
FOREIGN KEY ("universityId") REFERENCES "University"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UniversityFactValue"
ADD CONSTRAINT "UniversityFactValue_supersedesId_fkey"
FOREIGN KEY ("supersedesId") REFERENCES "UniversityFactValue"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
