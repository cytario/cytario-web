/**
 * Prisma database seed for E2E tests.
 *
 * Creates test fixtures in a fresh database. Runs automatically after
 * `prisma db push` or explicitly via `npx prisma db seed`.
 *
 * The ConnectionConfig uses ownerScope "cytario" so it's visible to any user
 * in the /cytario group (which includes both e2e-test and e2e-admin users).
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { PrismaClient } from "../app/.generated/client.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const TEST_CONNECTION_NAME = process.env.E2E_CONNECTION_NAME || "Exchange";

async function seed() {
  await prisma.connectionConfig.upsert({
    where: { name: TEST_CONNECTION_NAME },
    update: {},
    create: {
      name: TEST_CONNECTION_NAME,
      ownerScope: "cytario",
      createdBy: "e2e-seed",
      bucketName: "slashm-ultivue-exchange",
      provider: "aws",
      endpoint: "https://s3.eu-central-1.amazonaws.com",
      roleArn: "arn:aws:iam::727043715722:role/keycloack-aws-test-iam-role",
      region: "eu-central-1",
      prefix: "",
    },
  });

  console.log(`Seeded ConnectionConfig: "${TEST_CONNECTION_NAME}"`);
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
