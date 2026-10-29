-- The organization a user last worked in, so a login lands back there instead
-- of falling to the alphabetically first membership. One row per user: the
-- alias is a preference, not identity, so the user id is the primary key.
CREATE TABLE "UserOrgPreference" (
    "userId" TEXT NOT NULL,
    "lastOrgAlias" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserOrgPreference_pkey" PRIMARY KEY ("userId")
);
