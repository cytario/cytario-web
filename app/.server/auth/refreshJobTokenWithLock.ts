import { createHash } from "crypto";

import { refreshJobToken, type RefreshedJobToken } from "./refreshJobToken";
import { redis } from "../db/redis";
import { withRedisLock } from "../db/redisLock";

const LOCK_PREFIX = "broker_rt_lock:";
const STORE_PREFIX = "broker_rt:";
// Safety-net TTL; revokeGrant DELs on revocation. Matches the realm's 7-day
// offline-session max so a long job's cache isn't reaped mid-run.
const STORE_TTL_SECONDS = 604800;

// Key derivation only — no signature verification. Returns "" if undecodable.
function offlineSessionIdFromToken(token: string): string {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return "";
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
      session_state?: string;
    };
    return payload.session_state ?? "";
  } catch {
    return "";
  }
}

/**
 * Single-flight refresh for batch-shared offline sessions (SRS-CY-416108).
 * A per-offlineSessionId Redis lock + canonical-token store lets N containers
 * sharing one grant converge on one current refresh token instead of racing
 * (SRS-CY-416109). Redeems at Keycloak on every call — no cache-hit fast path
 * (preserves the revocation guarantee of SRS-CY-416102(a)).
 */
export async function refreshJobTokenWithLock(
  presentedRefreshToken: string,
): Promise<RefreshedJobToken> {
  const offlineSessionId = offlineSessionIdFromToken(presentedRefreshToken);
  // Hash fallback when the JWT is undecodable — no convergence, but the raw
  // token is never placed in the Redis key.
  const keySuffix =
    offlineSessionId || `hash:${createHash("sha256").update(presentedRefreshToken).digest("hex")}`;
  const lockKey = `${LOCK_PREFIX}${keySuffix}`;
  const storeKey = `${STORE_PREFIX}${keySuffix}`;

  return withRedisLock(lockKey, async () => {
    // Redeem the canonical token, not the caller's — under
    // refresh_token_max_reuse=0 the caller's may already be revoked.
    const canonicalRefreshToken = await redis.get(storeKey);
    const tokenToRedeem = canonicalRefreshToken ?? presentedRefreshToken;
    const result = await refreshJobToken(tokenToRedeem);
    // Write before lock release so waiters read the current token.
    await redis.set(storeKey, result.newRefreshToken, "EX", STORE_TTL_SECONDS);
    return result;
  });
}

// Idempotent.
export async function clearJobGrantStore(offlineSessionId: string): Promise<void> {
  if (!offlineSessionId) return;
  await redis.del(`${STORE_PREFIX}${offlineSessionId}`);
}
