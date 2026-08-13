import { randomUUID } from "crypto";

import { redis } from "../db/redis";

const PENDING_PREFIX = "job_grant_pending:";
const PENDING_TTL_SECONDS = 300; // 5 minutes

/**
 * The pending submission stored between the initiate and callback phases
 * of the job-grant Authorization Code flow. The host stores this in Redis
 * before redirecting to Keycloak and retrieves it on callback to complete
 * the submission.
 */
export interface PendingJobSubmission {
  /** The plugin endpoint path to invoke on callback (e.g. "/api/plugin/run"). */
  pluginPath: string;
  /** The serialized request body (JSON string) the plugin's prepare phase validated. */
  requestBody: string;
  /** The submitting user's subject identifier. */
  userId: string;
  /** The submitting user's organization. */
  organization: string;
  /** The browser path to redirect to after submission (e.g. "/plugin/jobs"). */
  returnPath: string;
  /** The batch identifier shared by all jobs in this submission. */
  batchId: string;
  /** The PKCE code verifier for the Authorization Code exchange. */
  codeVerifier: string;
}

/**
 * Stores a pending job submission in Redis and returns the state token
 * used as the OAuth `state` parameter. The state token is the Redis key
 * suffix; on callback, the host retrieves the pending submission (and
 * the PKCE verifier) by this token and deletes it (single-use).
 */
export async function storePendingSubmission(
  submission: Omit<PendingJobSubmission, "batchId">,
): Promise<{ state: string; batchId: string }> {
  const state = randomUUID();
  const batchId = randomUUID();
  const record: PendingJobSubmission = { ...submission, batchId };
  await redis.setex(`${PENDING_PREFIX}${state}`, PENDING_TTL_SECONDS, JSON.stringify(record));
  return { state, batchId };
}

/**
 * Retrieves and deletes a pending job submission by its state token.
 * Returns null if the token is expired or unknown. Single-use — the
 * record is deleted atomically via GETDEL (Redis 6.2+ / Valkey).
 */
export async function consumePendingSubmission(
  state: string,
): Promise<PendingJobSubmission | null> {
  const key = `${PENDING_PREFIX}${state}`;
  const raw = await redis.getdel(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingJobSubmission;
  } catch {
    return null;
  }
}
