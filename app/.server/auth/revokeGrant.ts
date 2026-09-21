import { deleteBatchCredentials } from "./jobCredentialStore";
import { prisma } from "../db/prisma";
import { adminRequestWithToken, KeycloakAdminError } from "./keycloakAdmin/client";
import { getJobBrokerToken } from "./keycloakAdmin/serviceAccountToken";

// Uses the least-privilege job-broker SA (only `manage-users`) and deletes the
// batch's held credentials so a cached access token dies with the grant. The
// `isOffline=true` query is required: Keycloak's deleteSession defaults to a
// regular user session, which 404s for an offline grant and silently fails to
// revoke. A 404 means already revoked — treated as success (idempotent).
export async function revokeGrant(offlineSessionId: string): Promise<void> {
  if (!offlineSessionId) {
    throw new Error("revokeGrant requires a non-empty offlineSessionId");
  }

  const accessToken = await getJobBrokerToken();
  const path = `/sessions/${encodeURIComponent(offlineSessionId)}?isOffline=true`;

  try {
    await adminRequestWithToken(accessToken, "DELETE", path);
  } catch (error) {
    // 404 = already revoked; still clear the record to heal a partial revocation.
    if (!(error instanceof KeycloakAdminError && error.status === 404)) {
      throw error;
    }
  }

  // Best-effort: a database hiccup must not undo the revocation. The row check
  // the broker performs on every mint backstops a miss, and the record is inert
  // once the offline session is gone.
  const record = await prisma.jobGrantCredential
    .findUnique({ where: { offlineSessionId }, select: { batchId: true } })
    .catch(() => null);
  if (!record) return;

  await deleteBatchCredentials(record.batchId).catch((err) => {
    console.warn(
      `revokeGrant: failed to delete broker credential record for ${offlineSessionId}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  });
}
