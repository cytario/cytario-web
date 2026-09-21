import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { cytarioConfig } from "~/config";

/**
 * Application-layer encryption for secrets held in Postgres — currently the
 * batch's broker credentials. The key comes from the
 * deployment environment (`DB_ENCRYPTION_KEY`, base64-encoded 32 bytes); there
 * is no KMS dependency.
 *
 * AES-256-GCM: every ciphertext carries a random 12-byte IV and a 16-byte auth
 * tag, with the IV and tag prepended to the ciphertext so one base64 blob
 * round-trips through `encryptSecret` / `decryptSecret`. The auth tag makes the
 * blob tamper-evident — a truncated or modified ciphertext fails to decrypt
 * rather than returning garbage.
 */

const KEY = cytarioConfig.dbEncryptionKey
  ? Buffer.from(cytarioConfig.dbEncryptionKey, "base64")
  : null;

const IV_BYTES = 12;
const TAG_BYTES = 16;

let warnedMissingKey = false;

/**
 * Only an explicitly local run may fall back to plaintext, so a deployment that
 * simply forgot to set `NODE_ENV` cannot quietly store a refresh token in the
 * clear — the fallback is opt-in, not the default. Two escape hatches: `NODE_ENV
 * === "production"` refuses outright, and anything that is not clearly a local
 * development run refuses too.
 */
const PLAINTEXT_ALLOWED_ENVS = new Set(["development", "test"]);

function requireKey(): Buffer | null {
  if (KEY) return KEY;
  const nodeEnv = process.env.NODE_ENV ?? "";
  if (!PLAINTEXT_ALLOWED_ENVS.has(nodeEnv)) {
    throw new Error(
      `DB_ENCRYPTION_KEY is required to store broker credentials (NODE_ENV=${nodeEnv || "unset"}) — set it to a base64-encoded 32-byte key`,
    );
  }
  if (!warnedMissingKey) {
    warnedMissingKey = true;
    console.warn(
      `[crypto] DB_ENCRYPTION_KEY is unset (NODE_ENV=${nodeEnv}) — secrets are stored unencrypted. Set it for any non-local deployment.`,
    );
  }
  return null;
}

export async function encryptSecret(plaintext: string): Promise<string> {
  const key = requireKey();
  if (!key) return plaintext;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}

export async function decryptSecret(ciphertext: string): Promise<string> {
  const key = requireKey();
  if (!key) return ciphertext;
  const blob = Buffer.from(ciphertext, "base64");
  const iv = blob.subarray(0, IV_BYTES);
  const tag = blob.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const encrypted = blob.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf-8");
}
