-- AlterTable: Make roleArn optional (for non-AWS providers)
ALTER TABLE "BucketConfig" ALTER COLUMN "roleArn" DROP NOT NULL;

-- Data migration: Convert "null" string values to actual NULL
UPDATE "BucketConfig" SET "roleArn" = NULL WHERE "roleArn" = 'null';

-- Data migration: Set existing null endpoints to AWS default based on region
UPDATE "BucketConfig"
SET "endpoint" = CONCAT('https://s3.', COALESCE("region", 'eu-central-1'), '.amazonaws.com')
WHERE "endpoint" IS NULL;

-- AlterTable: Make endpoint required (all providers need an endpoint)
ALTER TABLE "BucketConfig" ALTER COLUMN "endpoint" SET NOT NULL;

-- Add provider column
ALTER TABLE "BucketConfig" ADD COLUMN "provider" TEXT;

-- Set existing buckets to "aws"
UPDATE "BucketConfig" SET "provider" = 'aws' WHERE "provider" IS NULL;

-- Make provider required
ALTER TABLE "BucketConfig" ALTER COLUMN "provider" SET NOT NULL;

-- Drop old unique constraint and add new one with provider
DROP INDEX IF EXISTS "BucketConfig_userId_name_key";
CREATE UNIQUE INDEX "BucketConfig_userId_provider_name_key" ON "BucketConfig"("userId", "provider", "name");
