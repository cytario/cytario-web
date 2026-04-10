import { ConnectionConfig } from "~/.generated/client";
import type { UserProfile } from "~/.server/auth/getUserInfo";
import { prisma } from "~/.server/db/prisma";
import { canSee, filterVisible } from "~/utils/authorization";

/** List all connection configs visible to the user. */
export async function listConnections(
  user: UserProfile,
): Promise<ConnectionConfig[]> {
  const allConfigs = await prisma.connectionConfig.findMany();
  return filterVisible(user, allConfigs);
}

/** Get a connection config by its unique name. */
export async function getConnection(
  user: UserProfile,
  name: string,
): Promise<ConnectionConfig | null> {
  const config = await prisma.connectionConfig.findUnique({
    where: { name },
  });
  if (!config) return null;
  return canSee(user, config.ownerScope) ? config : null;
}
