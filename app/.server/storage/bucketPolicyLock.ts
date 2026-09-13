import { randomUUID } from "crypto";

import { redis } from "~/.server/db/redis";
import { createLabel } from "~/.server/logging";

// `PutBucketPolicy` replaces the whole document with no conditional-write
// primitive, so all writers (here and in the admin portal) must serialize on
// the SAME lock key — a pinned cross-repo contract. Single-Redis lease, no
// renewal: the TTL must exceed the worst-case critical section by a wide
// margin, or an expired lease readmits the read-merge-write clobber this
// lock exists to prevent.

const label = createLabel("bucketpolicy-lock", "magenta");

const LOCK_TTL_SECONDS = 180;
const MAX_RETRIES = 30;
const RETRY_DELAY_MS = 100;

/** Atomic check-and-delete so a writer only releases its own lock. */
const RELEASE_LOCK_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The pinned lock key for a bucket in a given storage account namespace. The
 * namespace is the AWS account id on AWS targets, or the S3-compatible
 * endpoint host on a RustFS target (one instance serves one account).
 */
export const bucketPolicyLockKey = (accountId: string, bucketName: string): string =>
  `bucketpolicy:${accountId}:${bucketName}`;

// Throws if the lock cannot be acquired so the caller fails closed rather
// than writing unserialized.
export async function withBucketPolicyLock<T>(
  accountId: string,
  bucketName: string,
  fn: () => Promise<T>,
): Promise<T> {
  const lockKey = bucketPolicyLockKey(accountId, bucketName);
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

  console.warn(`${label} Failed to acquire lock ${lockKey} after ${MAX_RETRIES} attempts`);
  throw new Error(
    `Could not serialize bucket-policy write for ${bucketName}; another writer holds the lock. Try again shortly.`,
  );
}
