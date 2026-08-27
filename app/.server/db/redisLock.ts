import { randomUUID } from "crypto";

import { redis } from "./redis";

const LOCK_TTL_SECONDS = 15;
const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 100;

const RELEASE_LOCK_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Acquires a Redis NX lock with `lockKey`, runs `fn` inside it, and releases
 * the lock atomically on return or throw. Retries with backoff until
 * `MAX_RETRIES`. The lock value is a random UUID and the release is a
 * Lua check-and-delete so a stale lock (expired TTL) is never released by
 * the wrong holder.
 */
export async function withRedisLock<T>(lockKey: string, fn: () => Promise<T>): Promise<T> {
  const lockValue = randomUUID();

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const acquired = await redis.set(lockKey, lockValue, "EX", LOCK_TTL_SECONDS, "NX");

    if (acquired === "OK") {
      try {
        return await fn();
      } finally {
        await redis.eval(RELEASE_LOCK_SCRIPT, 1, lockKey, lockValue);
      }
    }

    await delay(RETRY_DELAY_MS);
  }

  throw new Error("Failed to acquire Redis lock after maximum retries");
}
