CREATE TYPE "DataValueStatus" AS ENUM ('VERIFIED', 'NOT_PUBLISHED', 'PENDING_REVIEW', 'OUTDATED', 'CONFLICTING_SOURCES', 'NOT_APPLICABLE');

CREATE TABLE "SourceArtifact" ("id" TEXT NOT NULL,"sourceId" TEXT NOT NULL,"url" TEXT NOT NULL,"documentTitle" TEXT,"mimeType" TEXT NOT NULL,"checksumSha256" TEXT NOT NULL,"localCachePath" TEXT,"httpHeaders" JSONB,"retrievedAt" TIMESTAMP(3) NOT NULL,"year" INTEGER,"category" TEXT,CONSTRAINT "SourceArtifact_pkey" PRIMARY KEY ("id"));
CREATE TABLE "MetricValue" ("id" TEXT NOT NULL,"programId" TEXT NOT NULL,"artifactId" TEXT,"metricKey" TEXT NOT NULL,"competitionType" TEXT,"year" INTEGER NOT NULL,"value" JSONB,"status" "DataValueStatus" NOT NULL,"sourceUrl" TEXT NOT NULL,"sourceName" TEXT NOT NULL,"sourceDocumentTitle" TEXT,"sourcePage" INTEGER,"sourceSheet" TEXT,"sourceRange" TEXT,"sourceSection" TEXT,"retrievedAt" TIMESTAMP(3) NOT NULL,"checkedAt" TIMESTAMP(3) NOT NULL,"checkedBy" TEXT NOT NULL,"nextReviewAt" TIMESTAMP(3),"note" TEXT,"version" INTEGER NOT NULL DEFAULT 1,"supersedesId" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "MetricValue_pkey" PRIMARY KEY ("id"));
CREATE TABLE "ScoreProfile" ("id" TEXT NOT NULL,"userId" TEXT NOT NULL,"name" TEXT NOT NULL,"individualAchievements" INTEGER NOT NULL DEFAULT 0,"dviScore" INTEGER,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "ScoreProfile_pkey" PRIMARY KEY ("id"));
CREATE TABLE "ExamScore" ("profileId" TEXT NOT NULL,"subjectId" TEXT NOT NULL,"score" INTEGER NOT NULL,CONSTRAINT "ExamScore_pkey" PRIMARY KEY ("profileId", "subjectId"));

CREATE UNIQUE INDEX "SourceArtifact_url_checksumSha256_key" ON "SourceArtifact"("url", "checksumSha256");
CREATE INDEX "SourceArtifact_sourceId_retrievedAt_idx" ON "SourceArtifact"("sourceId", "retrievedAt");
CREATE UNIQUE INDEX "MetricValue_programId_metricKey_year_competitionType_version_key" ON "MetricValue"("programId", "metricKey", "year", "competitionType", "version");
CREATE INDEX "MetricValue_programId_year_metricKey_idx" ON "MetricValue"("programId", "year", "metricKey");
CREATE INDEX "MetricValue_status_checkedAt_idx" ON "MetricValue"("status", "checkedAt");
CREATE INDEX "ScoreProfile_userId_updatedAt_idx" ON "ScoreProfile"("userId", "updatedAt");

ALTER TABLE "SourceArtifact" ADD CONSTRAINT "SourceArtifact_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "DataSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MetricValue" ADD CONSTRAINT "MetricValue_programId_fkey" FOREIGN KEY ("programId") REFERENCES "EducationProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MetricValue" ADD CONSTRAINT "MetricValue_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "SourceArtifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MetricValue" ADD CONSTRAINT "MetricValue_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "MetricValue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ScoreProfile" ADD CONSTRAINT "ScoreProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExamScore" ADD CONSTRAINT "ExamScore_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "ScoreProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExamScore" ADD CONSTRAINT "ExamScore_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "ExamSubject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
