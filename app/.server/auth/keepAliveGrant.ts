import { refreshJobTokenWithLock } from "./refreshJobTokenWithLock";
import { redis } from "../db/redis";

/**
 * Refreshes the canonical grant token for a live offline session ahead of
 * expiry (SDS-CY-080900). A batch whose jobs outlive the grant's idle window
 * relies on this keepalive — the broker's redeem path alone only refreshes
 * when a container actually mints credentials.
 *
 * Resolves the canonical refresh token from the broker store and refreshes
 * through {@link refreshJobTokenWithLock}, so a keepalive cannot race a
 * concurrent broker redeem: both paths converge on the per-session Redis
 * lock and the single canonical token. The rotated token lands back in the
 * store with the same TTL discipline as a broker redeem.
 *
 * Never throws and never resurrects a revoked session: an absent store entry
 * (never-minted or revoked grant, which clears the store on revocation) is a
 * no-op, and a failed refresh — a session revoked at the identity service
 * since the last refresh — is a warn-level no-op.
 */
export async function keepAliveGrant(offlineSessionId: string): Promise<void> {
  if (!offlineSessionId) return;

  let canonicalRefreshToken: string | null;
  try {
    canonicalRefreshToken = await redis.get(`broker_rt:${offlineSessionId}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`keepAliveGrant: store lookup failed for ${offlineSessionId}: ${message}`);
    return;
  }
  if (!canonicalRefreshToken) return;

  try {
    await refreshJobTokenWithLock(canonicalRefreshToken);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `keepAliveGrant: refresh failed for ${offlineSessionId}: ${message} — treating as revoked`,
    );
  }
}
