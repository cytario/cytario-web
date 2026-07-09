/**
 * Prisma database seed for E2E tests.
 *
 * Creates test fixtures in a fresh database. Runs automatically after
 * `prisma db push` or explicitly via `npx prisma db seed`.
 *
 * Both connections point to the same bucket (shared-bucket-example).
 * The prefixed connection tests prefix-based directory listing without
 * requiring a separate bucket or cross-bucket auth setup.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { PrismaClient } from "../app/.generated/client.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const TEST_CONNECTION_NAME = process.env.E2E_CONNECTION_NAME || "Exchange";
const TEST_PREFIX_CONNECTION_NAME = process.env.E2E_PREFIX_CONNECTION_NAME || "Exchange-prefixed";

// A connection references a provider connection + provider role by id (the
// concrete role ARN / endpoint / region live in the OSS provider catalog or the
// portal lookup, §4.12) — it no longer stores provider/roleArn/region/endpoint.
const SHARED_BUCKET = {
  organization: "cytario",
  scope: "admins",
  createdBy: "e2e-seed",
  bucketName: "shared-bucket-example",
  providerConnectionId: "aws-eu-central-1",
  providerRoleId: "sharer-lab",
};

async function seed() {
  await prisma.connectionConfig.upsert({
    where: { name: TEST_CONNECTION_NAME },
    update: {},
    create: {
      ...SHARED_BUCKET,
      name: TEST_CONNECTION_NAME,
      prefix: "",
    },
  });

  await prisma.connectionConfig.upsert({
    where: { name: TEST_PREFIX_CONNECTION_NAME },
    update: {},
    create: {
      ...SHARED_BUCKET,
      name: TEST_PREFIX_CONNECTION_NAME,
      prefix: "Alpha Lab",
    },
  });

  console.log(
    `Seeded ConnectionConfig: "${TEST_CONNECTION_NAME}", "${TEST_PREFIX_CONNECTION_NAME}"`,
  );
}

seed()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
