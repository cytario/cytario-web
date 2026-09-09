import { prisma } from "~/.server/db/prisma";

/**
 * The org-scoped connection list for the service-to-service connections API
 * Mirrors `listConnections` in
 * `routes/connections/connections.server.ts` minus the session-user
 * visibility filter: the caller is the admin portal, which legitimately sees
 * every connection in the org it asks about (it is the org's onboarding
 * service), not a user whose view is filtered by scope.
 */
export async function listConnectionsForOrganization(organization: string) {
  return prisma.connectionConfig.findMany({
    where: { organization },
    include: { grants: true },
  });
}
