ALTER TABLE "NotificationPreference"
  ADD COLUMN "deadlineEmailEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TYPE "DeadlineEmailState" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'UNKNOWN', 'CANCELLED');

CREATE TABLE "DeadlineEmailJob" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "trackerItemId" TEXT NOT NULL,
  "deadlineAt" TIMESTAMP(3) NOT NULL,
  "availableAt" TIMESTAMP(3) NOT NULL,
  "state" "DeadlineEmailState" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "leaseUntil" TIMESTAMP(3),
  "resultCode" TEXT,
  CONSTRAINT "DeadlineEmailJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DeadlineEmailJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "DeadlineEmailJob_state_availableAt_idx" ON "DeadlineEmailJob"("state", "availableAt");
CREATE INDEX "DeadlineEmailJob_state_leaseUntil_idx" ON "DeadlineEmailJob"("state", "leaseUntil");
CREATE INDEX "DeadlineEmailJob_userId_idx" ON "DeadlineEmailJob"("userId");
CREATE INDEX "AccountTrackerItem_deadlineAt_idx" ON "AccountTrackerItem"("deadlineAt");

CREATE TABLE "WorkerHeartbeat" (
  "id" TEXT NOT NULL,
  "finishedAt" TIMESTAMP(3) NOT NULL,
  "counts" JSONB NOT NULL,
  CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("id")
);
