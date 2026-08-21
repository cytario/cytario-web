import { createHash, randomUUID } from "crypto";

import { refreshJobToken, type RefreshedJobToken } from "./refreshJobToken";
import { redis } from "../db/redis";

const LOCK_PREFIX = "broker_rt_lock:";
const STORE_PREFIX = "broker_rt:";
const LOCK_TTL_SECONDS = 15;
// Safety-net TTL; revokeGrant DELs on revocation. Matches the realm's 7-day
// offline-session max so a long job's cache isn't reaped mid-run.
const STORE_TTL_SECONDS = 604800;
const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 100;

// Mirrors the browser-path release script in refreshAuthTokens.ts.
const RELEASE_LOCK_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  const lockValue = randomUUID();

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const acquired = await redis.set(lockKey, lockValue, "EX", LOCK_TTL_SECONDS, "NX");

    if (acquired === "OK") {
      try {
        // Redeem the canonical token, not the caller's — under
        // refresh_token_max_reuse=0 the caller's may already be revoked.
        const canonicalRefreshToken = await redis.get(storeKey);
        const tokenToRedeem = canonicalRefreshToken ?? presentedRefreshToken;
        const result = await refreshJobToken(tokenToRedeem);
        // Write before lock release so waiters read the current token.
        await redis.set(storeKey, result.newRefreshToken, "EX", STORE_TTL_SECONDS);
        return result;
      } finally {
        await redis.eval(RELEASE_LOCK_SCRIPT, 1, lockKey, lockValue);
      }
    }

    await delay(RETRY_DELAY_MS);
  }

  throw new Error("Failed to acquire broker refresh lock after maximum retries");
}

// Idempotent.
export async function clearJobGrantStore(offlineSessionId: string): Promise<void> {
  if (!offlineSessionId) return;
  await redis.del(`${STORE_PREFIX}${offlineSessionId}`);
}
