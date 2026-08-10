import { adminRequestWithToken, KeycloakAdminError } from "./keycloakAdmin/client";
import { getJobBrokerToken } from "./keycloakAdmin/serviceAccountToken";

/**
 * Revokes an offline grant at the identity service by destroying the
 * Keycloak offline session identified by `offlineSessionId`
 * (SDS-CY-010098, SDS-CY-080900, SRS-CY-416106).
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
 * Called by the reconciler after a job reaches a terminal state, before
 * removing the ledger row (SRS-CY-416106). A missing or already-revoked
 * session returns 404 from Keycloak — treated as success (idempotent).
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
    if (error instanceof KeycloakAdminError && error.status === 404) {
      return;
    }
    throw error;
  }
}
