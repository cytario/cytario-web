-- CreateTable
CREATE TABLE "JobLedgerEntry" (
"id" TEXT NOT NULL,
"jobId" TEXT NOT NULL,
"offlineSessionId" TEXT NOT NULL,
"organization" TEXT NOT NULL,
"owner" TEXT NOT NULL,
"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "JobLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobLedgerEntry_organization_jobId_key" ON "JobLedgerEntry"("organization", "jobId");

-- CreateIndex
CREATE INDEX "JobLedgerEntry_organization_owner_idx" ON "JobLedgerEntry"("organization", "owner");
