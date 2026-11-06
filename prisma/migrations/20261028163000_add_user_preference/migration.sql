-- Persistent per-user preferences (org preference, tour completion, …) — one
-- row per (user, key) with a JSON value, so a new preference is a key, not a
-- migration.
CREATE TABLE "UserPreference" (
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("userId", "key")
);
