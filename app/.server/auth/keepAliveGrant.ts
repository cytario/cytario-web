import { refreshJobTokenWithLock } from "./refreshJobTokenWithLock";
import { redis } from "../db/redis";

// Never throws: an absent store entry or a failed refresh is a warn-level
// no-op — a revoked session is never resurrected. Races with a concurrent
// broker redeem are excluded by the per-session lock in refreshJobTokenWithLock.
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
