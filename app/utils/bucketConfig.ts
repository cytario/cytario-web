import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { BucketConfig, PrismaClient } from "~/.generated/client";
import { canModify, canSee, filterVisible } from "~/.server/auth/authorization";
import type { UserProfile } from "~/.server/auth/getUserInfo";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Get all bucket configs visible to the user
export async function getBucketConfigs(
  user: UserProfile,
): Promise<BucketConfig[]> {
  const allConfigs = await prisma.bucketConfig.findMany();
  return filterVisible(user, allConfigs);
}

// Get a specific bucket config by provider, name, and exact prefix
export async function getBucketConfigByName(
  user: UserProfile,
  provider: string,
  name: string,
  prefix: string = "",
): Promise<BucketConfig | null> {
  const configs = await prisma.bucketConfig.findMany({
    where: { provider, name, prefix },
  });
  const visible = configs.filter((c) => canSee(user, c.ownerScope));
  return visible[0] ?? null;
}

// Find the best matching bucket config for a given path
// This handles the case where multiple configs exist for the same bucket with different prefixes
// TODO: Introduce unique alias
export async function getBucketConfigByPath(
  user: UserProfile,
  provider: string,
  name: string,
  pathName: string = "",
): Promise<BucketConfig | null> {
  const allConfigs = await prisma.bucketConfig.findMany({
    where: { provider, name },
  });
  const configs = allConfigs.filter((c) => canSee(user, c.ownerScope));

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
    (current.prefix?.length ?? 0) > (best.prefix?.length ?? 0) ? current : best,
  );
}

// Upsert a bucket config
export async function upsertBucketConfig(
  ownerScope: string,
  createdBy: string,
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
      ownerScope_provider_name_prefix: {
        ownerScope,
        provider: config.provider,
        name: config.name,
        prefix,
      },
    },
    update: { ...config, prefix },
    create: {
      ownerScope,
      createdBy,
      ...config,
      prefix,
    },
  });
}

// Delete a bucket config (with authorization check)
export async function deleteBucketConfig(
  user: UserProfile,
  provider: string,
  name: string,
  prefix: string = "",
) {
  const configs = await prisma.bucketConfig.findMany({
    where: { provider, name, prefix },
  });

  const config = configs.find((c) => canSee(user, c.ownerScope));

  if (!config) {
    throw new Error("Bucket config not found");
  }

  if (!canModify(user, config.ownerScope)) {
    throw new Error("Not authorized to delete this bucket config");
  }

  return prisma.bucketConfig.delete({ where: { id: config.id } });
}
