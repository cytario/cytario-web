import { adminRequestWithToken, KeycloakAdminError } from "./keycloakAdmin/client";
import { getJobBrokerToken } from "./keycloakAdmin/serviceAccountToken";
import { clearJobGrantStore } from "./refreshJobTokenWithLock";

// Uses the least-privilege job-broker SA (only `manage-users`) and clears the
// broker's canonical refresh-token cache so a cached token dies with the grant.
// The `isOffline=true` query is required: Keycloak's deleteSession defaults to
// a regular user session, which 404s for an offline grant and silently fails
// to revoke. A 404 means already revoked — treated as success (idempotent).
export async function revokeGrant(offlineSessionId: string): Promise<void> {
  if (!offlineSessionId) {
    throw new Error("revokeGrant requires a non-empty offlineSessionId");
  }

  const accessToken = await getJobBrokerToken();
  const path = `/sessions/${encodeURIComponent(offlineSessionId)}?isOffline=true`;

  try {
    await adminRequestWithToken(accessToken, "DELETE", path);
  } catch (error) {
    // 404 = already revoked; still clear the store to heal a partial revocation.
    if (!(error instanceof KeycloakAdminError && error.status === 404)) {
      throw error;
    }
  }

  // Best-effort: a Redis hiccup must not undo the revocation. The 7-day TTL
  // and Keycloak's revoked session (next refresh 401s) backstop a miss.
  await clearJobGrantStore(offlineSessionId).catch((err) => {
    console.warn(
      `revokeGrant: failed to clear broker token store for ${offlineSessionId}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  });
}
