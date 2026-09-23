import { createHash, randomBytes } from "node:crypto";

import { refreshJobToken } from "./refreshJobToken";
import { decryptSecret, encryptSecret } from "../db/crypto";
import { prisma } from "../db/prisma";
import { withRedisLock } from "../db/redisLock";

// Access tokens live ~300 s (the realm sets no override). The margin only
// decides when a held token is treated as too old to serve; it must stay well
// below the lifespan or the cache would never be usable and every mint would
// travel to the identity service.
const ACCESS_TOKEN_MARGIN_MS = 30_000;

// A refresh is a single identity-service round trip; the lock must outlive one
// so a waiter is served from the refresh in flight rather than starting its
// own. Only reached on a cold or stale cache.
const REFRESH_LOCK_TTL_SECONDS = 30;
const REFRESH_LOCK_ATTEMPTS = 50;
const REFRESH_LOCK_RETRY_MS = 200;

/** SHA-256 of a presented job token. The raw token is never stored. */
export function hashJobToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** High-entropy, opaque, and meaningless on its own — the binding lives in the ledger row. */
export function generateJobSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

function refreshLockKey(batchId: string): string {
  return `broker_refresh_lock:${batchId}`;
}

export interface BatchCredentials {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
}

interface HeldAccessToken {
  accessToken: string;
  accessTokenExpiresAt: Date;
}

/** Reads the record's ciphertext without decrypting. */
export async function readRawCredentialRecord(batchId: string) {
  return prisma.jobGrantCredential.findUnique({ where: { batchId } });
}

/** Creates the record for a fresh grant — called once per batch, at submission. */
export async function putBatchCredentials(input: {
  batchId: string;
  offlineSessionId: string;
  refreshToken: string;
  accessToken: string;
  accessTokenExpiresAt: Date;
}): Promise<void> {
  const encryptedRefreshToken = await encryptSecret(input.refreshToken);
  const encryptedAccessToken = await encryptSecret(input.accessToken);
  await prisma.jobGrantCredential.upsert({
    where: { batchId: input.batchId },
    create: {
      batchId: input.batchId,
      offlineSessionId: input.offlineSessionId,
      encryptedRefreshToken,
      encryptedAccessToken,
      accessTokenExpiresAt: input.accessTokenExpiresAt,
    },
    update: {
      offlineSessionId: input.offlineSessionId,
      encryptedRefreshToken,
      encryptedAccessToken,
      accessTokenExpiresAt: input.accessTokenExpiresAt,
    },
  });
}

/**
 * The access half of the record, decrypted. The common case for a mint is a
 * held token that is still fresh, and the refresh token stays ciphertext until
 * a refresh actually needs it.
 */
export async function getHeldAccessToken(batchId: string): Promise<HeldAccessToken | null> {
  const record = await readRawCredentialRecord(batchId);
  if (!record) return null;
  return {
    accessToken: await decryptSecret(record.encryptedAccessToken),
    accessTokenExpiresAt: record.accessTokenExpiresAt,
  };
}

export async function getBatchCredentials(batchId: string): Promise<BatchCredentials | null> {
  const record = await readRawCredentialRecord(batchId);
  if (!record) return null;
  return {
    accessToken: await decryptSecret(record.encryptedAccessToken),
    refreshToken: await decryptSecret(record.encryptedRefreshToken),
    accessTokenExpiresAt: record.accessTokenExpiresAt,
  };
}

/** The batch's offline-session identifier, for the reconciler's keep-alive and revocation. */
export async function getOfflineSessionId(batchId: string): Promise<string | null> {
  const record = await prisma.jobGrantCredential.findUnique({
    where: { batchId },
    select: { offlineSessionId: true },
  });
  return record?.offlineSessionId ?? null;
}

export async function deleteBatchCredentials(batchId: string): Promise<void> {
  await prisma.jobGrantCredential.deleteMany({ where: { batchId } });
}

/**
 * Collects the batch once the last job of it is gone. The delete is one
 * statement guarded by the relation, so it cannot collect a credential a live
 * sibling still needs: the `ledgerEntries: { none: {} }` predicate is the same
 * join the foreign key enforces, read in the other direction.
 */
export async function collectCredentialsIfBatchEmpty(batchId: string): Promise<void> {
  await prisma.jobGrantCredential.deleteMany({
    where: { batchId, ledgerEntries: { none: {} } },
  });
}

function isFresh(held: HeldAccessToken, now: number): boolean {
  return held.accessTokenExpiresAt.getTime() > now + ACCESS_TOKEN_MARGIN_MS;
}

// `updateMany`, not an upsert: a revocation that deleted the record while this
// refresh was in flight must win, so a refresh only writes to a record that is
// still there. It touches neither the identity columns nor the key.
async function persistRefreshed(
  batchId: string,
  refreshed: Awaited<ReturnType<typeof refreshJobToken>>,
): Promise<boolean> {
  const { count } = await prisma.jobGrantCredential.updateMany({
    where: { batchId },
    data: {
      encryptedRefreshToken: await encryptSecret(refreshed.newRefreshToken),
      encryptedAccessToken: await encryptSecret(refreshed.accessToken),
      accessTokenExpiresAt: new Date(Date.now() + refreshed.expiresInSeconds * 1000),
    },
  });
  return count > 0;
}

/**
 * Returns a usable access token for the batch, refreshing at the identity
 * service only when the held one is missing or too old. The freshness check
 * sits outside the lock on purpose — with it inside, every caller of a cold
 * batch would serialize on a round trip instead of converging on one refresh —
 * and is repeated inside the lock, so a caller that waited is served from the
 * refresh its sibling performed rather than consuming the rotated token again.
 *
 * `force` skips the fresh-cache fast path: keep-alive's whole purpose is to
 * touch the identity service, so it must not be served from the cache.
 */
export async function resolveBatchAccessToken(
  batchId: string,
  options: { force?: boolean } = {},
): Promise<string | null> {
  const held = await getHeldAccessToken(batchId);
  if (!held) return null;
  if (!options.force && isFresh(held, Date.now())) return held.accessToken;

  return withRedisLock(
    refreshLockKey(batchId),
    async () => {
      // A sibling may have refreshed while this call waited, or the record may
      // have been deleted outright by a revoke; the re-check decides, and a
      // record that is gone stays gone.
      const current = await getHeldAccessToken(batchId);
      if (!current) return null;
      if (!options.force && isFresh(current, Date.now())) return current.accessToken;
      const { refreshToken } = (await getBatchCredentials(batchId)) ?? {};
      if (!refreshToken) return null;
      const refreshed = await refreshJobToken(refreshToken);
      if (!(await persistRefreshed(batchId, refreshed))) return null;
      return refreshed.accessToken;
    },
    {
      ttlSeconds: REFRESH_LOCK_TTL_SECONDS,
      maxRetries: REFRESH_LOCK_ATTEMPTS,
      retryDelayMs: REFRESH_LOCK_RETRY_MS,
    },
  );
}
