-- Breaking migration: Keycloak organization alias becomes the tenant key on
-- ConnectionConfig. Per C-221 there is no production data yet; existing dev
-- rows are dropped so the new NOT NULL column can land without a backfill.
-- Cascades clear `RecentlyViewed` and `PinnedPath` through their FKs.
DELETE FROM "ConnectionConfig";

-- AlterTable: add the tenant column
ALTER TABLE "ConnectionConfig" ADD COLUMN "organization" TEXT NOT NULL;

-- DropIndex: legacy ownerScope-based unique + index
DROP INDEX "ConnectionConfig_ownerScope_provider_bucketName_prefix_key";
DROP INDEX "ConnectionConfig_ownerScope_idx";

-- CreateIndex: org-scoped unique + lookup index
CREATE UNIQUE INDEX "ConnectionConfig_organization_provider_bucketName_prefix_key" ON "ConnectionConfig"("organization", "provider", "bucketName", "prefix");
CREATE INDEX "ConnectionConfig_organization_ownerScope_idx" ON "ConnectionConfig"("organization", "ownerScope");
