-- Per-connection endpoint override for public provider connections; null
-- means the provider's own (catalog-configured) endpoint applies.

ALTER TABLE "ConnectionConfig" ADD COLUMN "publicEndpoint" TEXT;
