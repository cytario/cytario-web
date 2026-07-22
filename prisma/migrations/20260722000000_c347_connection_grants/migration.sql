-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "BucketPolicyStatus" AS ENUM ('none', 'applied', 'drifted', 'error');

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateIndex
CREATE INDEX "ConnectionConfig_organization_name_idx" ON "ConnectionConfig"("organization", "name");

-- CreateIndex
CREATE INDEX "ConnectionGrant_scope_idx" ON "ConnectionGrant"("scope");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectionGrant_connectionId_scope_key" ON "ConnectionGrant"("connectionId", "scope");

-- CreateIndex
CREATE INDEX "RecentlyViewed_userId_idx" ON "RecentlyViewed"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RecentlyViewed_userId_connectionId_pathName_key" ON "RecentlyViewed"("userId", "connectionId", "pathName");

-- CreateIndex
CREATE INDEX "PinnedPath_userId_idx" ON "PinnedPath"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PinnedPath_userId_connectionId_pathName_key" ON "PinnedPath"("userId", "connectionId", "pathName");

-- AddForeignKey
ALTER TABLE "ConnectionGrant" ADD CONSTRAINT "ConnectionGrant_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "ConnectionConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecentlyViewed" ADD CONSTRAINT "RecentlyViewed_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "ConnectionConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PinnedPath" ADD CONSTRAINT "PinnedPath_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "ConnectionConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

