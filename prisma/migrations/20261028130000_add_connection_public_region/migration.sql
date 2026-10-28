-- Bucket region for a public connection, discovered at creation from the
-- storage provider's wrong-region redirect (x-amz-bucket-region); null means
-- the provider's own (catalog-configured) region applies.

ALTER TABLE "ConnectionConfig" ADD COLUMN "publicRegion" TEXT;
