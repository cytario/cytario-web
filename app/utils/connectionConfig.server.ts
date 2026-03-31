import { ConnectionConfig } from "~/.generated/client";
import { canCreate, canModify, canSee, filterVisible } from "~/.server/auth/authorization";
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

// Get a connection config by its unique name
export async function getConnectionByName(
  user: UserProfile,
  name: string,
): Promise<ConnectionConfig | null> {
  const config = await prisma.connectionConfig.findUnique({
    where: { name },
  });
  if (!config) return null;
  return canSee(user, config.ownerScope) ? config : null;
}

// Upsert a connection config
export async function upsertConnectionConfig(
  ownerScope: string,
  createdBy: string,
  config: {
    name: string;
    bucketName: string;
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
      ownerScope_provider_bucketName_prefix: {
        ownerScope,
        provider: config.provider,
        bucketName: config.bucketName,
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

// Delete a connection config by its unique name (with authorization check)
export async function deleteConnectionConfig(
  user: UserProfile,
  name: string,
) {
  const config = await prisma.connectionConfig.findUnique({
    where: { name },
  });

  if (!config || !canSee(user, config.ownerScope)) {
    throw new Error("Connection config not found");
  }

  if (!canModify(user, config.ownerScope)) {
    throw new Error("Not authorized to delete this connection config");
  }

  await prisma.connectionConfig.delete({ where: { id: config.id } });
}

// Update the ownerScope of a connection config (with authorization checks)
export async function updateConnectionScope(
  user: UserProfile,
  name: string,
  newOwnerScope: string,
) {
  const config = await prisma.connectionConfig.findUnique({
    where: { name },
  });

  if (!config || !canSee(user, config.ownerScope)) {
    throw new Error("Connection not found");
  }

  if (!canModify(user, config.ownerScope)) {
    throw new Error("Not authorized to modify this connection");
  }

  if (!canCreate(user, newOwnerScope)) {
    throw new Error("Not authorized to assign to this scope");
  }

  return prisma.connectionConfig.update({
    where: { id: config.id },
    data: { ownerScope: newOwnerScope },
  });
}
