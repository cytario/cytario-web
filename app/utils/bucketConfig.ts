import { PrismaPg } from "@prisma/adapter-pg";
import { BucketConfig, PrismaClient } from "@prisma/client";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Get all bucket configs for a user
export async function getBucketConfigsForUser(
  userId: string
): Promise<BucketConfig[]> {
  return prisma.bucketConfig.findMany({ where: { userId } });
}

// Get a specific bucket config by provider and name
export async function getBucketConfigByName(
  userId: string,
  provider: string,
  name: string
): Promise<BucketConfig | null> {
  return prisma.bucketConfig.findUnique({
    where: { userId_provider_name: { userId, provider, name } },
  });
}

// Upsert a bucket config
export async function upsertBucketConfig(
  userId: string,
  config: {
    name: string;
    provider: string;
    roleArn: string | null;
    region: string | null;
    endpoint: string;
  }
) {
  return prisma.bucketConfig.upsert({
    where: {
      userId_provider_name: {
        userId,
        provider: config.provider,
        name: config.name,
      },
    },
    update: config,
    create: {
      userId,
      ...config,
    },
  });
}

// Delete a bucket config
export async function deleteBucketConfig(
  userId: string,
  provider: string,
  name: string
) {
  return prisma.bucketConfig.delete({
    where: { userId_provider_name: { userId, provider, name } },
  });
}
