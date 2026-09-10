-- Records which connected compute provider a ledgered job was submitted to.
-- Nullable: absent means the org's first connected provider.
-- AlterTable
ALTER TABLE "JobLedgerEntry" ADD COLUMN "providerId" TEXT;
