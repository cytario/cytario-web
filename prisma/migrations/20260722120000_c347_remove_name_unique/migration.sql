-- C-347: Remove the unique constraint on ConnectionConfig.name.
-- Connections are now identified by their integer id; name is a plain label.
-- RecentlyViewed and PinnedPath FKs move from connectionName → connectionId.

-- Add connectionId columns (nullable initially for backfill).
ALTER TABLE "RecentlyViewed" ADD COLUMN "connectionId" INTEGER;
ALTER TABLE "PinnedPath" ADD COLUMN "connectionId" INTEGER;

-- Backfill connectionId from the existing connectionName → ConnectionConfig.id lookup.
UPDATE "RecentlyViewed" rv
SET "connectionId" = cc."id"
FROM "ConnectionConfig" cc
WHERE rv."connectionName" = cc."name";

UPDATE "PinnedPath" pp
SET "connectionId" = cc."id"
FROM "ConnectionConfig" cc
WHERE pp."connectionName" = cc."name";

-- Make connectionId NOT NULL after backfill.
ALTER TABLE "RecentlyViewed" ALTER COLUMN "connectionId" SET NOT NULL;
ALTER TABLE "PinnedPath" ALTER COLUMN "connectionId" SET NOT NULL;

-- Drop old FK constraints on connectionName.
ALTER TABLE "RecentlyViewed" DROP CONSTRAINT "RecentlyViewed_connectionName_fkey";
ALTER TABLE "PinnedPath" DROP CONSTRAINT "PinnedPath_connectionName_fkey";

-- Add new FK constraints on connectionId.
ALTER TABLE "RecentlyViewed" ADD CONSTRAINT "RecentlyViewed_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "ConnectionConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PinnedPath" ADD CONSTRAINT "PinnedPath_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "ConnectionConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop old unique indexes.
DROP INDEX "RecentlyViewed_userId_connectionName_pathName_key";
DROP INDEX "PinnedPath_userId_connectionName_pathName_key";

-- Create new unique indexes on (userId, connectionId, pathName).
CREATE UNIQUE INDEX "RecentlyViewed_userId_connectionId_pathName_key" ON "RecentlyViewed"("userId", "connectionId", "pathName");
CREATE UNIQUE INDEX "PinnedPath_userId_connectionId_pathName_key" ON "PinnedPath"("userId", "connectionId", "pathName");

-- Drop the unique index on ConnectionConfig.name.
DROP INDEX "ConnectionConfig_name_key";

-- Add a plain index on (organization, name) for lookup-by-name queries.
CREATE INDEX "ConnectionConfig_organization_name_idx" ON "ConnectionConfig"("organization", "name");
