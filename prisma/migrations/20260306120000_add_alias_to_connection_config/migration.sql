-- AlterTable: add alias column (nullable initially for backfill)
ALTER TABLE "BucketConfig" ADD COLUMN "alias" TEXT;

-- Backfill aliases for existing rows:
--   No prefix  → "provider-name"        (e.g. "aws-my-bucket")
--   With prefix → "provider-name-lastSegment" (e.g. "aws-my-bucket-deliverables")
-- Append "-id" suffix on collision.
UPDATE "BucketConfig"
SET "alias" = sub.alias
FROM (
  SELECT
    id,
    CASE
      WHEN ROW_NUMBER() OVER (
        PARTITION BY base_alias ORDER BY id
      ) = 1 THEN base_alias
      ELSE base_alias || '-' || id::text
    END AS alias
  FROM (
    SELECT
      id,
      LOWER(
        CASE
          WHEN "prefix" = '' THEN "provider" || '-' || "name"
          ELSE "provider" || '-' || "name" || '-' ||
               REVERSE(SPLIT_PART(REVERSE(RTRIM("prefix", '/')), '/', 1))
        END
      ) AS base_alias
    FROM "BucketConfig"
  ) inner_sub
) sub
WHERE "BucketConfig".id = sub.id;

-- Make alias non-nullable and unique
ALTER TABLE "BucketConfig" ALTER COLUMN "alias" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "BucketConfig_alias_key" ON "BucketConfig"("alias");
