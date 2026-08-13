-- AlterTable
ALTER TABLE "JobLedgerEntry" ADD COLUMN "batchId" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "JobLedgerEntry_offlineSessionId_idx" ON "JobLedgerEntry"("offlineSessionId");
