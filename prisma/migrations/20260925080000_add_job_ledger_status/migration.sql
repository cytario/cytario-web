-- A ledger row is now recorded in Pending before the provider is called; the
-- provider job id and reported state are attached on acceptance, so jobId
-- becomes nullable. Existing rows already carry a provider job id (they are
-- not pending), so they backfill to Queued rather than the Pending default.
-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('Pending', 'Queued', 'Running', 'Completed', 'Failed', 'FailedInsufficientResources', 'Stopping', 'Stopped');

-- AlterTable
ALTER TABLE "JobLedgerEntry" ALTER COLUMN "jobId" DROP NOT NULL;
ALTER TABLE "JobLedgerEntry" ADD COLUMN "status" "JobStatus" NOT NULL DEFAULT 'Pending';
UPDATE "JobLedgerEntry" SET "status" = 'Queued' WHERE "status" = 'Pending';

-- CreateIndex
CREATE INDEX "JobLedgerEntry_status_createdAt_idx" ON "JobLedgerEntry"("status", "createdAt");
