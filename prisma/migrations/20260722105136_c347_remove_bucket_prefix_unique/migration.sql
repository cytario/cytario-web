-- DropIndex
DROP INDEX "ConnectionConfig_organization_providerConnectionId_bucketNa_key";

-- CreateIndex
CREATE INDEX "ConnectionConfig_organization_providerConnectionId_bucketNa_idx" ON "ConnectionConfig"("organization", "providerConnectionId", "bucketName", "prefix");
