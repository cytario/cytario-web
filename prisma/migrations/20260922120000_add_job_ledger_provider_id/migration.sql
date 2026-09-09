-- Compute-provider selection: record which connected provider each ledgered
-- job was submitted to. Nullable — rows predating this migration have no
-- provider and the reconciler falls back to the org's first connected provider.
-- AlterTable
ALTER TABLE "JobLedgerEntry" ADD COLUMN "providerId" TEXT;
