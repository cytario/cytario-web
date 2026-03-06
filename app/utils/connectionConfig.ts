import { ConnectionConfig } from "~/.generated/client";
import { canModify, canSee, filterVisible } from "~/.server/auth/authorization";
import type { UserProfile } from "~/.server/auth/getUserInfo";
import { prisma } from "~/.server/db/prisma";

export type { ConnectionConfig };

// Get all connection configs visible to the user
export async function getConnectionConfigs(
  user: UserProfile,
): Promise<ConnectionConfig[]> {
  const allConfigs = await prisma.connectionConfig.findMany();
  return filterVisible(user, allConfigs);
}

// Get a connection config by its unique alias
export async function getConnectionByAlias(
  user: UserProfile,
  alias: string,
): Promise<ConnectionConfig | null> {
  const config = await prisma.connectionConfig.findUnique({
    where: { alias },
  });
  if (!config) return null;
  return canSee(user, config.ownerScope) ? config : null;
}

// Upsert a connection config
export async function upsertConnectionConfig(
  ownerScope: string,
  createdBy: string,
  config: {
    alias: string;
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

// Delete a connection config by alias (with authorization check) and cascade-delete related recents/pins
export async function deleteConnectionConfig(
  user: UserProfile,
  alias: string,
) {
  const config = await prisma.connectionConfig.findUnique({
    where: { alias },
  });

  if (!config || !canSee(user, config.ownerScope)) {
    throw new Error("Connection config not found");
  }

  if (!canModify(user, config.ownerScope)) {
    throw new Error("Not authorized to delete this connection config");
  }

  await prisma.$transaction([
    prisma.recentlyViewed.deleteMany({ where: { alias } }),
    prisma.pinnedPath.deleteMany({ where: { alias } }),
    prisma.connectionConfig.delete({ where: { id: config.id } }),
  ]);
}
