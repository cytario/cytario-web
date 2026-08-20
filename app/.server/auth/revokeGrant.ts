import { adminRequestWithToken, KeycloakAdminError } from "./keycloakAdmin/client";
import { getJobBrokerToken } from "./keycloakAdmin/serviceAccountToken";
import { clearJobGrantStore } from "./refreshJobTokenWithLock";

/**
 * Revokes an offline grant at the identity service by destroying the
 * Keycloak offline session identified by `offlineSessionId`
 * (SDS-CY-010098, SDS-CY-080900, SRS-CY-416106), and clears the broker's
 * canonical refresh-token cache for that session (SDS-CY-080402) so a
 * cached token dies with the grant rather than lingering up to the 7-day
 * safety-net TTL.
 *
 * Uses the job-broker service account, whose only realm-management role is
 * `manage-users` — the narrowest standard role covering the session-
 * revocation endpoint (SDS-CY-020105: "the narrow admin permission
 * required to revoke a user offline session and no broader set"). The
 * broader cytario-web-admin client is not used here, keeping the revocation
 * path on a least-privilege credential.
 *
 * The plugin passes only the session identifier — never the raw token — and
 * the host performs the revocation via
 * `DELETE /admin/realms/{realm}/sessions/{sessionId}?isOffline=true`. The
 * `isOffline=true` query is required: Keycloak's `deleteSession` defaults
 * `isOffline=false` and looks up a *regular* user session, which would 404
 * for an offline grant and silently fail to revoke.
 *
 * A missing or already-revoked session returns 404 from Keycloak — treated
 * as success (idempotent); the store clear is likewise idempotent.
 */
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
