-- C-347: per-group roles on storage connections.
-- ConnectionConfig.id migrates from SERIAL to TEXT (UUID), `scope` is replaced
-- by the ConnectionGrant table, and child tables (RecentlyViewed, PinnedPath)
-- switch from connectionName FK to connectionId FK.
-- Per the DEV-reset policy there is no production data to preserve, so the
-- affected tables are dropped and recreated rather than backfilled.

-- DropTable: children first (FKs), then the parent.
DROP TABLE IF EXISTS "RecentlyViewed";
DROP TABLE IF EXISTS "PinnedPath";
DROP TABLE IF EXISTS "ConnectionConfig";

-- DropEnum: recreated below (already exists from prior migration, but DROP
-- IF EXISTS makes this migration idempotent when run forward on a fresh DB
-- that already applied the prior migration which created it).
DROP TYPE IF EXISTS "BucketPolicyStatus";

-- CreateEnum
CREATE TYPE "BucketPolicyStatus" AS ENUM ('none', 'applied', 'drifted', 'error');

-- CreateTable: ConnectionConfig with UUID id, no scope column.
CREATE TABLE "ConnectionConfig" (
"id" TEXT NOT NULL,
"name" TEXT NOT NULL,
"organization" TEXT NOT NULL,
"createdBy" TEXT NOT NULL,
"bucketName" TEXT NOT NULL,
"providerConnectionId" TEXT NOT NULL,
"prefix" TEXT NOT NULL DEFAULT '',
"bucketPolicyStatus" "BucketPolicyStatus" NOT NULL DEFAULT 'none',

CONSTRAINT "ConnectionConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectionGrant" (
"id" TEXT NOT NULL,
"connectionId" TEXT NOT NULL,
"scope" TEXT NOT NULL,
"providerRoleId" TEXT NOT NULL,

CONSTRAINT "ConnectionGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable: RecentlyViewed (relates to ConnectionConfig by id).
CREATE TABLE "RecentlyViewed" (
"id" TEXT NOT NULL,
"userId" TEXT NOT NULL,
"connectionId" TEXT NOT NULL,
"connectionName" TEXT NOT NULL,
"pathName" TEXT NOT NULL,
"name" TEXT NOT NULL,
"type" TEXT NOT NULL,
"viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "RecentlyViewed_pkey" PRIMARY KEY ("id")
);

-- CreateTable: PinnedPath (relates to ConnectionConfig by id).
CREATE TABLE "PinnedPath" (
"id" TEXT NOT NULL,
"userId" TEXT NOT NULL,
"connectionId" TEXT NOT NULL,
"connectionName" TEXT NOT NULL,
"pathName" TEXT NOT NULL,
"displayName" TEXT NOT NULL,
"totalSize" BIGINT,
"lastModified" TIMESTAMP(3),

CONSTRAINT "PinnedPath_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConnectionConfig_organization_providerConnectionId_bucketNa_idx" ON "ConnectionConfig"("organization", "providerConnectionId", "bucketName", "prefix");
CREATE INDEX "ConnectionConfig_organization_name_idx" ON "ConnectionConfig"("organization", "name");
CREATE INDEX "ConnectionGrant_scope_idx" ON "ConnectionGrant"("scope");
CREATE UNIQUE INDEX "ConnectionGrant_connectionId_scope_key" ON "ConnectionGrant"("connectionId", "scope");
CREATE INDEX "RecentlyViewed_userId_idx" ON "RecentlyViewed"("userId");
CREATE UNIQUE INDEX "RecentlyViewed_userId_connectionId_pathName_key" ON "RecentlyViewed"("userId", "connectionId", "pathName");
CREATE INDEX "PinnedPath_userId_idx" ON "PinnedPath"("userId");
CREATE UNIQUE INDEX "PinnedPath_userId_connectionId_pathName_key" ON "PinnedPath"("userId", "connectionId", "pathName");

-- AddForeignKey
ALTER TABLE "ConnectionGrant" ADD CONSTRAINT "ConnectionGrant_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "ConnectionConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecentlyViewed" ADD CONSTRAINT "RecentlyViewed_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "ConnectionConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PinnedPath" ADD CONSTRAINT "PinnedPath_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "ConnectionConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
