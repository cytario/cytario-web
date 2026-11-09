import { ConnectionConfig, ConnectionGrant } from "~/.generated/client";
import type { UserProfile } from "~/.server/auth/getUserInfo";
import { prisma } from "~/.server/db/prisma";
import { canSee, filterVisible } from "~/utils/authorization";

/** A connection config with its grants eager-loaded. */
export type ConnectionConfigWithGrants = ConnectionConfig & { grants: ConnectionGrant[] };

/**
 * Server-side tenant boundary: every ConnectionConfig query is pre-filtered by
 * the org the request acts in (the URL's `/:org`, resolved by the auth
 * middleware). Throwing here is defence-in-depth.
 */
function requireOrganization(organization: string | undefined): string {
  if (!organization) {
    throw new Error("Request organization missing");
  }
  return organization;
}

/** List all connection configs visible to the user within the request org. */
export async function listConnections(
  user: UserProfile,
  organization: string | undefined,
): Promise<ConnectionConfigWithGrants[]> {
  const org = requireOrganization(organization);
  const allConfigs = await prisma.connectionConfig.findMany({
    where: { organization: org },
    // Deterministic order — Postgres returns unordered rows without this, and
    // the sidebar's default-selected connection follows the first entry.
    orderBy: { name: "asc" },
    include: { grants: true },
  });
  return filterVisible(user, allConfigs, org);
}

/** Get a connection config by its id, scoped to the request org. */
export async function getConnection(
  user: UserProfile,
  organization: string | undefined,
  id: string,
): Promise<ConnectionConfigWithGrants | null> {
  const org = requireOrganization(organization);
  const config = await prisma.connectionConfig.findFirst({
    where: { id, organization: org },
    include: { grants: true },
  });
  if (!config || !canSee(user, config, org)) return null;
  return config;
}
