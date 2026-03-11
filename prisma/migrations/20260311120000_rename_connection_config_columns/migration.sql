-- RenameColumn: "name" -> "bucketName" (must happen first to free up the name)
ALTER TABLE "BucketConfig" RENAME COLUMN "name" TO "bucketName";

-- RenameColumn: "alias" -> "name"
ALTER TABLE "BucketConfig" RENAME COLUMN "alias" TO "name";

-- RenameColumn: FK columns in related tables
ALTER TABLE "RecentlyViewed" RENAME COLUMN "alias" TO "connectionName";
ALTER TABLE "PinnedPath" RENAME COLUMN "alias" TO "connectionName";

-- RenameTable: "BucketConfig" -> "ConnectionConfig"
ALTER TABLE "BucketConfig" RENAME TO "ConnectionConfig";

-- RenameIndex: update index names to match new table/column names
ALTER INDEX "BucketConfig_pkey" RENAME TO "ConnectionConfig_pkey";
ALTER INDEX "BucketConfig_alias_key" RENAME TO "ConnectionConfig_name_key";
ALTER INDEX "BucketConfig_ownerScope_provider_name_prefix_key" RENAME TO "ConnectionConfig_ownerScope_provider_bucketName_prefix_key";
ALTER INDEX "BucketConfig_ownerScope_idx" RENAME TO "ConnectionConfig_ownerScope_idx";
ALTER INDEX "RecentlyViewed_userId_alias_pathName_key" RENAME TO "RecentlyViewed_userId_connectionName_pathName_key";
ALTER INDEX "PinnedPath_userId_alias_pathName_key" RENAME TO "PinnedPath_userId_connectionName_pathName_key";

-- RenameConstraint: update FK constraint names
ALTER TABLE "RecentlyViewed" RENAME CONSTRAINT "RecentlyViewed_alias_fkey" TO "RecentlyViewed_connectionName_fkey";
ALTER TABLE "PinnedPath" RENAME CONSTRAINT "PinnedPath_alias_fkey" TO "PinnedPath_connectionName_fkey";
