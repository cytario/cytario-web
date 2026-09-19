import { randomUUID } from "crypto";

import { redis } from "../db/redis";

const PENDING_PREFIX = "job_grant_pending:";
const PENDING_TTL_SECONDS = 300; // 5 minutes

export interface PendingJobSubmission {
  pluginPath: string;
  requestBody: string;
  userId: string;
  organization: string;
  returnPath: string;
  batchId: string;
  codeVerifier: string;
}

// The state token is the Redis key suffix; on callback the pending submission
// is retrieved by this token and deleted (single-use).
export async function storePendingSubmission(
  submission: Omit<PendingJobSubmission, "batchId">,
): Promise<{ state: string; batchId: string }> {
  const state = randomUUID();
  const batchId = randomUUID();
  const record: PendingJobSubmission = { ...submission, batchId };
  await redis.setex(`${PENDING_PREFIX}${state}`, PENDING_TTL_SECONDS, JSON.stringify(record));
  return { state, batchId };
}

// Single-use — the record is deleted atomically via GETDEL.
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
