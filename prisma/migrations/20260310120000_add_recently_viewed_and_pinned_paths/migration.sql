-- CreateTable
CREATE TABLE "RecentlyViewed" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "pathName" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecentlyViewed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PinnedPath" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "pathName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "totalSize" BIGINT,
    "lastModified" TIMESTAMP(3),

    CONSTRAINT "PinnedPath_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RecentlyViewed_userId_alias_pathName_key" ON "RecentlyViewed"("userId", "alias", "pathName");

-- CreateIndex
CREATE INDEX "RecentlyViewed_userId_idx" ON "RecentlyViewed"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PinnedPath_userId_alias_pathName_key" ON "PinnedPath"("userId", "alias", "pathName");

-- CreateIndex
CREATE INDEX "PinnedPath_userId_idx" ON "PinnedPath"("userId");

-- AddForeignKey
ALTER TABLE "RecentlyViewed" ADD CONSTRAINT "RecentlyViewed_alias_fkey" FOREIGN KEY ("alias") REFERENCES "BucketConfig"("alias") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PinnedPath" ADD CONSTRAINT "PinnedPath_alias_fkey" FOREIGN KEY ("alias") REFERENCES "BucketConfig"("alias") ON DELETE CASCADE ON UPDATE CASCADE;
