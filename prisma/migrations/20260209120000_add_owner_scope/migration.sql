-- RenameColumn
ALTER TABLE "BucketConfig" RENAME COLUMN "userId" TO "createdBy";

-- AddColumn
ALTER TABLE "BucketConfig" ADD COLUMN "ownerScope" TEXT;

-- Backfill: set ownerScope to createdBy for existing records
UPDATE "BucketConfig" SET "ownerScope" = "createdBy" WHERE "ownerScope" IS NULL;

-- AlterColumn: make ownerScope NOT NULL
ALTER TABLE "BucketConfig" ALTER COLUMN "ownerScope" SET NOT NULL;

-- DropIndex
DROP INDEX "BucketConfig_userId_provider_name_prefix_key";

-- CreateIndex
CREATE UNIQUE INDEX "BucketConfig_ownerScope_provider_name_prefix_key" ON "BucketConfig"("ownerScope", "provider", "name", "prefix");

-- CreateIndex
CREATE INDEX "BucketConfig_ownerScope_idx" ON "BucketConfig"("ownerScope");
