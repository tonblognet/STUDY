ALTER TABLE "User" ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Session" ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "UserStateSnapshot" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "RateLimitBucket" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "count" INTEGER NOT NULL,
  "resetAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "RateLimitBucket_resetAt_idx" ON "RateLimitBucket"("resetAt");
CREATE TABLE "AccountTrackerItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "programKey" TEXT NOT NULL,
  "admissionYear" INTEGER NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 1,
  "stage" TEXT NOT NULL DEFAULT 'shortlist',
  "documentsReady" BOOLEAN NOT NULL DEFAULT false,
  "consentReady" BOOLEAN NOT NULL DEFAULT false,
  "deadlineAt" TIMESTAMP(3),
  "notes" TEXT NOT NULL DEFAULT '',
  "history" JSONB NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  UNIQUE ("userId", "programKey", "admissionYear")
);
CREATE INDEX "AccountTrackerItem_userId_deadlineAt_idx" ON "AccountTrackerItem"("userId", "deadlineAt");
-- Preserve records from the legacy database API. Its UI used a separate local store.
INSERT INTO "AccountTrackerItem" ("id","userId","programKey","admissionYear","priority","stage","documentsReady","deadlineAt","notes","history","createdAt","updatedAt")
SELECT t."id",t."userId",p."slug",t."admissionYear",COALESCE(t."priority",1),
  CASE t."status" WHEN 'SUBMITTED' THEN 'submitted' WHEN 'IN_COMPETITION' THEN 'ranked' WHEN 'ENROLLED' THEN 'enrolled' WHEN 'WITHDRAWN' THEN 'withdrawn' WHEN 'DOCUMENTS_READY' THEN 'documents' ELSE 'shortlist' END,
  t."status" = 'DOCUMENTS_READY',
  t."deadlineAt",COALESCE(t."notes",''),t."history",t."createdAt",t."updatedAt"
FROM "AdmissionTrackerItem" t JOIN "EducationProgram" p ON p."id"=t."programId";
