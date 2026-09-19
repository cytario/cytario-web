import { prisma } from "~/.server/db/prisma";

// Deliberately omits the session-user visibility filter of `listConnections`:
// the caller is the admin portal (the org's onboarding service), which
// legitimately sees every connection in the org it asks about.
export async function listConnectionsForOrganization(organization: string) {
  return prisma.connectionConfig.findMany({
    where: { organization },
    include: { grants: true },
  });
}
