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

export interface RedisLockOptions {
  /** How long the lock survives if its holder dies before releasing it. */
  ttlSeconds?: number;
  maxRetries?: number;
  retryDelayMs?: number;
}

// The release is a Lua check-and-delete so a stale lock (expired TTL) is
// never released by the wrong holder.
export async function withRedisLock<T>(
  lockKey: string,
  fn: () => Promise<T>,
  options: RedisLockOptions = {},
): Promise<T> {
  const lockValue = randomUUID();
  const ttlSeconds = options.ttlSeconds ?? LOCK_TTL_SECONDS;
  const maxRetries = options.maxRetries ?? MAX_RETRIES;
  const retryDelayMs = options.retryDelayMs ?? RETRY_DELAY_MS;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const acquired = await redis.set(lockKey, lockValue, "EX", ttlSeconds, "NX");

    if (acquired === "OK") {
      try {
        return await fn();
      } finally {
        await redis.eval(RELEASE_LOCK_SCRIPT, 1, lockKey, lockValue);
      }
    }

    await delay(retryDelayMs);
  }

  throw new Error("Failed to acquire Redis lock after maximum retries");
}
