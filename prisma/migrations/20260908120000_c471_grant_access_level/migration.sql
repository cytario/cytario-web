-- RenameColumn: grants carry an access level; the storage role is resolved
-- server-side from the provider catalog at credential/policy time.
ALTER TABLE "ConnectionGrant" RENAME COLUMN "providerRoleId" TO "accessLevel";
