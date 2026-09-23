import { hashJobToken } from "./jobCredentialStore";
import { prisma } from "../db/prisma";

export interface ResolvedJobBinding {
  jobId: string;
  batchId: string;
  offlineSessionId: string;
  organization: string;
  owner: string;
  /**
   * The ledger row itself. Returned so the broker mints from the row it
   * resolved instead of re-reading it, which would only reopen a sweep race
   * the caller has no way to act on.
   */
  row: {
    jobId: string;
    batchId: string | null;
    offlineSessionId: string;
    organization: string;
    owner: string;
    inputS3Uris: string[];
    outputS3Uri: string;
    roleArn: string;
    region: string;
    s3Endpoint: string | null;
  };
}

/**
 * Resolves a presented job session token to the ledger row it was issued for —
 * the whole of the token's authority. The lookup is by token hash and nothing
 * else: no caller-supplied field takes part, so the per-job binding is
 * structural rather than asserted, and a row belonging to another job, user, or
 * tenant is unreachable because no query predicate can name it. The token is
 * 256 bits of entropy, so an indexed equality lookup is not a guessable oracle.
 */
export async function resolveJobBinding(
  presentedToken: string,
): Promise<ResolvedJobBinding | null> {
  const row = await prisma.jobLedgerEntry.findUnique({
    where: { jobTokenHash: hashJobToken(presentedToken) },
  });
  if (!row) return null;
  return {
    jobId: row.jobId,
    // Empty only on rows recorded before the credentials table existed; such a
    // row has no batch to mint for.
    batchId: row.batchId ?? "",
    offlineSessionId: row.offlineSessionId,
    organization: row.organization,
    owner: row.owner,
    row,
  };
}
