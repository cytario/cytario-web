import { ConnectionConfig, ConnectionGrant } from "~/.generated/client";
import type { UserProfile } from "~/.server/auth/getUserInfo";
import { prisma } from "~/.server/db/prisma";
import { canSee, filterVisible } from "~/utils/authorization";

/** A connection config with its grants eager-loaded. */
export type ConnectionConfigWithGrants = ConnectionConfig & { grants: ConnectionGrant[] };

/**
 * Server-side tenant boundary: every ConnectionConfig query is pre-filtered by
 * the active Keycloak organization. The auth middleware guarantees the claim
 * is present before any query runs; throwing here is defence-in-depth.
 */
function requireOrganization(user: UserProfile): string {
  if (!user.organization) {
    throw new Error("Active organization missing from session");
  }
  return user.organization;
}

/** List all connection configs visible to the user within the active org. */
export async function listConnections(user: UserProfile): Promise<ConnectionConfigWithGrants[]> {
  const organization = requireOrganization(user);
  const allConfigs = await prisma.connectionConfig.findMany({
    where: { organization },
    include: { grants: true },
  });
  return filterVisible(user, allConfigs);
}

/** Get a connection config by its id, scoped to the active org. */
export async function getConnection(
  user: UserProfile,
  id: string,
): Promise<ConnectionConfigWithGrants | null> {
  const organization = requireOrganization(user);
  const config = await prisma.connectionConfig.findFirst({
    where: { id, organization },
    include: { grants: true },
  });
  if (!config || !canSee(user, config)) return null;
  return config;
}
