import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { BucketConfig, PrismaClient } from "~/.generated/client";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Get all bucket configs for a user
export async function getBucketConfigsForUser(
  userId: string,
): Promise<BucketConfig[]> {
  return prisma.bucketConfig.findMany({ where: { userId } });
}

// Get a specific bucket config by provider, name, and exact prefix
export async function getBucketConfigByName(
  userId: string,
  provider: string,
  name: string,
  prefix: string = "",
): Promise<BucketConfig | null> {
  return prisma.bucketConfig.findUnique({
    where: { userId_provider_name_prefix: { userId, provider, name, prefix } },
  });
}

// Find the best matching bucket config for a given path
// This handles the case where multiple configs exist for the same bucket with different prefixes
export async function getBucketConfigByPath(
  userId: string,
  provider: string,
  name: string,
  pathName: string = "",
): Promise<BucketConfig | null> {
  // Get all configs for this bucket
  const configs = await prisma.bucketConfig.findMany({
    where: { userId, provider, name },
  });

  if (configs.length === 0) return null;
  if (configs.length === 1) return configs[0];

  // Find configs where the path matches or starts with the prefix
  // Normalize path for comparison
  const normalizedPath = pathName.replace(/\/$/, "");

  const matchingConfigs = configs.filter((config) => {
    if (!config.prefix) return true; // Empty prefix matches all paths
    const normalizedPrefix = config.prefix.replace(/\/$/, "");
    return (
      normalizedPath === normalizedPrefix ||
      normalizedPath.startsWith(`${normalizedPrefix}/`)
    );
  });

  if (matchingConfigs.length === 0) return null;

  // Return the most specific match (longest prefix)
  return matchingConfigs.reduce((best, current) =>
    (current.prefix?.length ?? 0) > (best.prefix?.length ?? 0) ? current : best
  );
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
    prefix?: string;
  },
) {
  const prefix = config.prefix ?? "";
  return prisma.bucketConfig.upsert({
    where: {
      userId_provider_name_prefix: {
        userId,
        provider: config.provider,
        name: config.name,
        prefix,
      },
    },
    update: { ...config, prefix },
    create: {
      userId,
      ...config,
      prefix,
    },
  });
}

// Delete a bucket config
export async function deleteBucketConfig(
  userId: string,
  provider: string,
  name: string,
  prefix: string = "",
) {
  return prisma.bucketConfig.delete({
    where: { userId_provider_name_prefix: { userId, provider, name, prefix } },
  });
}
