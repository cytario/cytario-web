-- Group memberships recorded at invite time, applied when the invitee first
-- logs in. Keyed by the invited email because Keycloak's invitation flow
-- creates no user record.

CREATE TABLE "PendingGroupAssignment" (
    "id" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "groupPath" TEXT NOT NULL,
    "invitedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingGroupAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PendingGroupAssignment_organization_email_groupPath_key" ON "PendingGroupAssignment"("organization", "email", "groupPath");
CREATE INDEX "PendingGroupAssignment_organization_email_idx" ON "PendingGroupAssignment"("organization", "email");
