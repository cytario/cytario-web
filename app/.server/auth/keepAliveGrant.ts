import { resolveBatchAccessToken } from "./jobCredentialStore";
import { prisma } from "../db/prisma";

// Never throws: an absent record or a failed refresh is a warn-level no-op — a
// revoked session is never resurrected. Races with a concurrent broker mint are
// excluded by the single-flight lock in the credential store.
//
// The reconciler addresses a grant by its session, so the batch is resolved
// through the relation: the session identifies the record, and the record
// identifies the batch the mint is keyed on.
export async function keepAliveGrant(offlineSessionId: string): Promise<void> {
  if (!offlineSessionId) return;

  try {
    const record = await prisma.jobGrantCredential.findUnique({
      where: { offlineSessionId },
      select: { batchId: true },
    });
    if (!record) return;
    // Forced: sharing the broker's cache would defeat the point of touching the
    // identity service to hold the offline session open.
    await resolveBatchAccessToken(record.batchId, { force: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `keepAliveGrant: refresh failed for ${offlineSessionId}: ${message} — treating as revoked`,
    );
  }
}
