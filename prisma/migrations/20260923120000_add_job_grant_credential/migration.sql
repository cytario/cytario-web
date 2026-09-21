-- The per-job broker token's hash: the broker resolves a presented token to
-- its ledger row through this, so the row stays the row's identity.
-- Nullable for rows recorded before the token existed.
-- AlterTable
ALTER TABLE "JobLedgerEntry" ADD COLUMN "jobTokenHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "JobLedgerEntry_jobTokenHash_key" ON "JobLedgerEntry"("jobTokenHash");

-- CreateTable
-- The batch's held credentials. `batchId` is the relation's parent key: the
-- ledger rows carry it, it is unique (one record per batch), so a row and its
-- authorization are joined by the schema rather than by a hand-matched session
-- id. `offlineSessionId` stays as the record's own address for the
-- session-keyed operations the reconciler performs — keep-alive and revocation.
CREATE TABLE "JobGrantCredential" (
"id" TEXT NOT NULL,
"batchId" TEXT NOT NULL,
"offlineSessionId" TEXT NOT NULL,
"encryptedRefreshToken" TEXT NOT NULL,
"encryptedAccessToken" TEXT NOT NULL,
"accessTokenExpiresAt" TIMESTAMP(3) NOT NULL,
"createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "JobGrantCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobGrantCredential_batchId_key" ON "JobGrantCredential"("batchId");

-- CreateIndex
CREATE INDEX "JobGrantCredential_offlineSessionId_idx" ON "JobGrantCredential"("offlineSessionId");

-- Ledger rows predate this table. Their `batchId` defaults to '' (see
-- 20260813120000_add_job_ledger_batch_id) and they belong to batches whose
-- credentials were never recorded, so there is nothing for them to relate to.
-- They are nulled rather than given a fabricated partner, which keeps the
-- constraint honest.
-- Relax the column first: the backfill below nulls it for rows with no partner.
ALTER TABLE "JobLedgerEntry" ALTER COLUMN "batchId" DROP NOT NULL;
ALTER TABLE "JobLedgerEntry" ALTER COLUMN "batchId" DROP DEFAULT;

UPDATE "JobLedgerEntry"
   SET "batchId" = NULL
 WHERE "batchId" = ''
    OR "batchId" NOT IN (SELECT "batchId" FROM "JobGrantCredential");

-- CreateIndex
CREATE INDEX "JobLedgerEntry_batchId_idx" ON "JobLedgerEntry"("batchId");

-- AddForeignKey
-- The relation carries the security-critical direction: a job's row can never
-- outlive its batch's authorization, so deleting the credential takes every row
-- with it and no ledger row is left holding scope it can no longer mint with.
--
-- The reverse (the last row going collects the credential) is not expressible
-- as a foreign key in any RDBMS — it would need a trigger. It is one relational
-- statement in the credential store instead, keyed on this same relation.
ALTER TABLE "JobLedgerEntry" ADD CONSTRAINT "JobLedgerEntry_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "JobGrantCredential"("batchId") ON DELETE CASCADE ON UPDATE CASCADE;