/*
  Warnings:

  - A unique constraint covering the columns `[userId,provider,name,prefix]` on the table `BucketConfig` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "BucketConfig_userId_provider_name_key";

-- AlterTable
ALTER TABLE "BucketConfig" ADD COLUMN     "prefix" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE UNIQUE INDEX "BucketConfig_userId_provider_name_prefix_key" ON "BucketConfig"("userId", "provider", "name", "prefix");
