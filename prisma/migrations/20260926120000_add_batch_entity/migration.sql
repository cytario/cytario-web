-- One submitted batch becomes its own entity: the identifier the ledger rows
-- and the provider tags already carry becomes a primary key, so the rows join
-- to it instead of correlating on a bare string. The nullable name is a
-- display annotation given at submit time — never unique, never looked up by.

-- DropForeignKey
-- The entry's old relation ran to the credential store, joining on the shared
-- batchId string. The batch now owns the relation.
ALTER TABLE "JobLedgerEntry" DROP CONSTRAINT "JobLedgerEntry_batchId_fkey";

-- CreateTable
CREATE TABLE "Batch" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "organization" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- Backfill: one Batch row per distinct batchId among the ledger rows, so every
-- existing batch becomes addressable as an entity. The organization comes from
-- the batch's own rows (a batch never spans orgs — the submit is org-scoped);
-- createdAt from its earliest row, the closest thing to the submit time the
-- existing data offers. Rows without a batch (pre-batch-tag vintages) have no
-- batch to relate to and stay as they are.
INSERT INTO "Batch" ("id", "organization", "createdAt")
SELECT e."batchId", e."organization", MIN(e."createdAt")
FROM "JobLedgerEntry" e
WHERE e."batchId" IS NOT NULL
GROUP BY e."batchId", e."organization";

-- AddForeignKey
-- The ledger entry references its batch as a relation. Deleting a batch row
-- nulls the reference rather than cascading — the batch is removed together
-- with its last ledger entry by the credential-collection sweep, which keeps
-- the timing in one place; the database must not race it.
ALTER TABLE "JobLedgerEntry" ADD CONSTRAINT "JobLedgerEntry_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
-- The credential hangs off the batch entity now; its unique batchId key is
-- preserved, so the broker, keep-alive, revocation and collection keep
-- addressing it by the batch identifier through the same relation. The
-- security-critical direction is unchanged: deleting the batch takes its
-- credentials with it, so no ledger row is left holding scope it can no longer
-- mint with.
ALTER TABLE "JobGrantCredential" ADD CONSTRAINT "JobGrantCredential_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
