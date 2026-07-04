-- Clean-forward migration for the C-44 provider-connection / provider-role redesign.
-- A storage connection no longer carries free-text provider/endpoint/roleArn/region;
-- it references a portal-managed (or OSS-configured) provider connection and provider
-- role by id. Per the DEV-reset policy there is no production data to preserve, so the
-- affected tables are dropped and recreated rather than backfilled.

-- DropTable: children first (FKs), then the parent. Drops cascade the old schema entirely.
DROP TABLE IF EXISTS "RecentlyViewed";
DROP TABLE IF EXISTS "PinnedPath";
DROP TABLE IF EXISTS "ConnectionConfig";

-- CreateEnum: per-connection bucket-policy status badge (SRS-CY-32605).
CREATE TYPE "BucketPolicyStatus" AS ENUM ('none', 'applied', 'drifted', 'error');

-- CreateTable: ConnectionConfig with provider-connection / provider-role references.
CREATE TABLE "ConnectionConfig" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "bucketName" TEXT NOT NULL,
    "providerConnectionId" TEXT NOT NULL,
    "providerRoleId" TEXT NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT '',
    "bucketPolicyStatus" "BucketPolicyStatus" NOT NULL DEFAULT 'none',

    CONSTRAINT "ConnectionConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable: RecentlyViewed (relates to ConnectionConfig by name).
CREATE TABLE "RecentlyViewed" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "connectionName" TEXT NOT NULL,
    "pathName" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecentlyViewed_pkey" PRIMARY KEY ("id")
);

-- CreateTable: PinnedPath (relates to ConnectionConfig by name).
CREATE TABLE "PinnedPath" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "connectionName" TEXT NOT NULL,
    "pathName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "totalSize" BIGINT,
    "lastModified" TIMESTAMP(3),

    CONSTRAINT "PinnedPath_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConnectionConfig_name_key" ON "ConnectionConfig"("name");
CREATE UNIQUE INDEX "ConnectionConfig_organization_providerConnectionId_bucketName_prefix_key" ON "ConnectionConfig"("organization", "providerConnectionId", "bucketName", "prefix");
CREATE INDEX "ConnectionConfig_organization_scope_idx" ON "ConnectionConfig"("organization", "scope");

CREATE UNIQUE INDEX "RecentlyViewed_userId_connectionName_pathName_key" ON "RecentlyViewed"("userId", "connectionName", "pathName");
CREATE INDEX "RecentlyViewed_userId_idx" ON "RecentlyViewed"("userId");

CREATE UNIQUE INDEX "PinnedPath_userId_connectionName_pathName_key" ON "PinnedPath"("userId", "connectionName", "pathName");
CREATE INDEX "PinnedPath_userId_idx" ON "PinnedPath"("userId");

-- AddForeignKey
ALTER TABLE "RecentlyViewed" ADD CONSTRAINT "RecentlyViewed_connectionName_fkey" FOREIGN KEY ("connectionName") REFERENCES "ConnectionConfig"("name") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PinnedPath" ADD CONSTRAINT "PinnedPath_connectionName_fkey" FOREIGN KEY ("connectionName") REFERENCES "ConnectionConfig"("name") ON DELETE CASCADE ON UPDATE CASCADE;
