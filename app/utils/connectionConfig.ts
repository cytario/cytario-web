import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { ConnectionConfig, PrismaClient } from "~/.generated/client";
import { canModify, canSee, filterVisible } from "~/.server/auth/authorization";
import type { UserProfile } from "~/.server/auth/getUserInfo";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

export type { ConnectionConfig };

// Get all connection configs visible to the user
export async function getConnectionConfigs(
  user: UserProfile,
): Promise<ConnectionConfig[]> {
  const allConfigs = await prisma.connectionConfig.findMany();
  return filterVisible(user, allConfigs);
}

// Get a specific connection config by provider, name, and exact prefix
export async function getConnectionByName(
  user: UserProfile,
  provider: string,
  name: string,
  prefix: string = "",
): Promise<ConnectionConfig | null> {
  const configs = await prisma.connectionConfig.findMany({
    where: { provider, name, prefix },
  });
  const visible = configs.filter((c) => canSee(user, c.ownerScope));
  return visible[0] ?? null;
}

// Find the best matching connection config for a given path
// This handles the case where multiple configs exist for the same bucket with different prefixes
// TODO: Introduce unique alias
export async function getConnectionByPath(
  user: UserProfile,
  provider: string,
  name: string,
  pathName: string = "",
): Promise<ConnectionConfig | null> {
  const allConfigs = await prisma.connectionConfig.findMany({
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

// Upsert a connection config
export async function upsertConnectionConfig(
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
  return prisma.connectionConfig.upsert({
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

// Delete a connection config (with authorization check) and cascade-delete related recents/pins
export async function deleteConnectionConfig(
  user: UserProfile,
  provider: string,
  name: string,
  prefix: string = "",
) {
  const configs = await prisma.connectionConfig.findMany({
    where: { provider, name, prefix },
  });

  const config = configs.find((c) => canSee(user, c.ownerScope));

  if (!config) {
    throw new Error("Connection config not found");
  }

  if (!canModify(user, config.ownerScope)) {
    throw new Error("Not authorized to delete this connection config");
  }

  await prisma.$transaction([
    prisma.recentlyViewed.deleteMany({ where: { provider, bucketName: name } }),
    prisma.pinnedPath.deleteMany({ where: { provider, bucketName: name } }),
    prisma.connectionConfig.delete({ where: { id: config.id } }),
  ]);
}
