-- CreateTable
CREATE TABLE "BucketConfig" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roleArn" TEXT NOT NULL,
    "region" TEXT,
    "endpoint" TEXT,

    CONSTRAINT "BucketConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BucketConfig_userId_name_key" ON "BucketConfig"("userId", "name");
