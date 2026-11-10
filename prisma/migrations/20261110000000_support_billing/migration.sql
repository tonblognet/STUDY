ALTER TYPE "PaymentStatus" ADD VALUE 'PARTIALLY_REFUNDED';

CREATE TYPE "PaymentInitStatus" AS ENUM ('LEGACY', 'NEW', 'IN_FLIGHT', 'READY', 'UNKNOWN', 'REJECTED');
CREATE TYPE "PaymentOperationKind" AS ENUM ('INIT', 'REFUND', 'RECONCILE');
CREATE TYPE "PaymentOperationState" AS ENUM ('IN_FLIGHT', 'SUCCEEDED', 'UNKNOWN', 'REJECTED');

-- Historical orders retain their original values. Missing purchase conditions
-- must be reconciled; today's Product is not a historical checkout snapshot.
ALTER TABLE "Payment"
  ADD COLUMN "terminalKey" TEXT,
  ADD COLUMN "providerEnvironment" TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN "checkoutProductCode" TEXT,
  ADD COLUMN "checkoutProductName" TEXT,
  ADD COLUMN "checkoutDurationDays" INTEGER,
  ADD COLUMN "checkoutEntitlements" JSONB,
  ADD COLUMN "initStatus" "PaymentInitStatus" NOT NULL DEFAULT 'LEGACY',
  ADD COLUMN "paymentUrl" TEXT,
  ADD COLUMN "needsReview" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "PaymentOperation" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "kind" "PaymentOperationKind" NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "externalRequestId" TEXT,
  "state" "PaymentOperationState" NOT NULL DEFAULT 'IN_FLIGHT',
  "leaseUntil" TIMESTAMP(3),
  "resultCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentOperation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PaymentOperation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PaymentOperation_externalRequestId_key" ON "PaymentOperation"("externalRequestId");
CREATE UNIQUE INDEX "PaymentOperation_paymentId_kind_idempotencyKey_key" ON "PaymentOperation"("paymentId", "kind", "idempotencyKey");
CREATE INDEX "PaymentOperation_state_leaseUntil_idx" ON "PaymentOperation"("state", "leaseUntil");
CREATE INDEX "PaymentOperation_paymentId_createdAt_idx" ON "PaymentOperation"("paymentId", "createdAt");

CREATE TABLE "PaymentGrant" (
  "paymentId" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "entitlementKeys" JSONB NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "PaymentGrant_pkey" PRIMARY KEY ("paymentId"),
  CONSTRAINT "PaymentGrant_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PaymentGrant_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PaymentGrant_subscriptionId_key" ON "PaymentGrant"("subscriptionId");
CREATE INDEX "Payment_needsReview_createdAt_idx" ON "Payment"("needsReview", "createdAt");

-- Old tickets have no invented response/closure times.
ALTER TABLE "SupportTicket"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "responseDueAt" TIMESTAMP(3),
  ADD COLUMN "firstRespondedAt" TIMESTAMP(3),
  ADD COLUMN "closedAt" TIMESTAMP(3);
CREATE INDEX "SupportTicket_assigneeId_status_updatedAt_idx" ON "SupportTicket"("assigneeId", "status", "updatedAt");
CREATE INDEX "SupportTicket_responseDueAt_status_idx" ON "SupportTicket"("responseDueAt", "status");
