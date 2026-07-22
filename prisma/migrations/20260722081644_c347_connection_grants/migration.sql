-- C-347: per-group roles on storage connections.
-- A connection now carries one or more grants — each a (group scope, provider-role)
-- pair — instead of a single scope + providerRoleId. Personal-scope connections
-- (scope = user.sub) are removed. The single scope/providerRoleId on each existing
-- ConnectionConfig row is migrated into one ConnectionGrant row before the columns
-- are dropped.

-- CreateTable: ConnectionGrant child table (one connection → many grants).
CREATE TABLE "ConnectionGrant" (
    "id" SERIAL NOT NULL,
    "connectionId" INTEGER NOT NULL,
    "scope" TEXT NOT NULL,
    "providerRoleId" TEXT NOT NULL,

    CONSTRAINT "ConnectionGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConnectionGrant_scope_idx" ON "ConnectionGrant"("scope");

-- CreateIndex: one grant per (connection, scope) — a group appears at most once.
CREATE UNIQUE INDEX "ConnectionGrant_connectionId_scope_key" ON "ConnectionGrant"("connectionId", "scope");

-- AddForeignKey: cascade-delete grants when a connection is removed.
ALTER TABLE "ConnectionGrant" ADD CONSTRAINT "ConnectionGrant_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "ConnectionConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: migrate each existing connection's single scope/providerRoleId into a
-- ConnectionGrant row. Personal-scope rows (scope = createdBy / user.sub) are
-- dropped — personal-scope connections are removed entirely by C-347. Org-root
-- scope (`*`) is preserved as a grant so existing org-root connections keep working.
INSERT INTO "ConnectionGrant" ("connectionId", "scope", "providerRoleId")
SELECT "id", "scope", "providerRoleId"
FROM "ConnectionConfig"
WHERE "scope" IS NOT NULL
  AND "providerRoleId" IS NOT NULL
  AND "scope" <> "createdBy";

-- DropIndex: the old (organization, scope) index moves to the grants table.
DROP INDEX "ConnectionConfig_organization_scope_idx";

-- AlterTable: drop the migrated columns from the parent.
ALTER TABLE "ConnectionConfig" DROP COLUMN "providerRoleId",
DROP COLUMN "scope";

-- RenameIndex: normalize the truncated unique-index name.
ALTER INDEX "ConnectionConfig_organization_providerConnectionId_bucketName_p" RENAME TO "ConnectionConfig_organization_providerConnectionId_bucketNa_key";
