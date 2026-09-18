import type { ActionFunctionArgs } from "react-router";

import {
  hostRequestDataFromJobToken,
  readOrganizationClaimKeys,
} from "~/.server/auth/carveOutRequestContext";
import {
  offlineSessionIdFromToken,
  refreshJobTokenWithLock,
} from "~/.server/auth/refreshJobTokenWithLock";
import {
  buildBrokerSessionPolicy,
  InlinePolicySizeError,
  parseS3Uri,
  type S3Target,
} from "~/.server/auth/sessionPolicy";
import { verifyJobToken } from "~/.server/auth/verifyJobToken";
import { prisma } from "~/.server/db/prisma";
import { withHostRequestContext } from "~/.server/hostRequestContext";
import { jsonError } from "~/.server/httpResponse";
import { createLabel } from "~/.server/logging";
import { assumeRoleWithWebIdentity, sanitizeRoleSessionName } from "~/.server/stsSession";

/**
 * Credential-broker endpoint: a running container calls this host-owned route
 * with its job-scoped token to obtain short-lived S3 storage credentials. The
 * broker is purely ledger-driven — it reads the storage role ARN, region, S3
 * endpoint, and the analysis's input/output targets from the ledger row
 * recorded at submission, with no provider catalog or connection query at
 * mint time.
 *
 * The container carries the grant's **refresh token** (not the access token),
 * because the access token's short `exp` would expire before a long job's
 * first broker call. The broker redeems (refreshes) the grant at the
 * identity service on every call (SRS-CY-416102(a), SDS-CY-080400) to obtain
 * a fresh, unexpired access token, verifies it, passes it to STS, and
 * returns the rotated refresh token so the container's next mint presents
 * the current (rotated) token. A revoked or expired grant mints nothing.
 *
 * Request body: `{ token: string, jobId: string }` — exactly what the SDK
 * sends. No caller-supplied field influences the credential scope.
 */

const label = createLabel("broker", "cyan");

interface BrokerRequestBody {
  token: string;
  jobId: string;
}

interface BrokerResponse {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: string;
  /**
   * The rotated refresh token the container must present on its next mint
   * (refresh-token rotation). The SDK overwrites its in-memory token
   * with this value.
   */
  refreshToken: string;
}

export async function action(args: ActionFunctionArgs): Promise<Response> {
  let body: BrokerRequestBody;
  try {
    body = (await args.request.json()) as BrokerRequestBody;
  } catch {
    return jsonError(400, "Invalid request body");
  }

  if (!body.token || !body.jobId) {
    return jsonError(400, "token and jobId are required");
  }

  // Redeem the offline grant at the identity service on every call
  // (SRS-CY-416102(a)) — a revoked or expired grant mints nothing. The
  // container carries a refresh token; the broker refreshes it host-side
  // (the job-broker client is confidential, so the container can't hold
  // the client_secret) and verifies the fresh access token before STS.
  let refreshedToken: string;
  let newRefreshToken: string;
  try {
    const refreshed = await refreshJobTokenWithLock(body.token);
    refreshedToken = refreshed.accessToken;
    newRefreshToken = refreshed.newRefreshToken;
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.warn(`${label} refresh failed for job ${body.jobId}: ${message}`);
    // A row that still exists means the job was recorded and not yet
    // reconciled — the grant was revoked while the binding lives on: 403.
    // No row means the grant is genuinely absent: 401. A single generic
    // message per branch reveals nothing beyond revoked-vs-expired. The
    // probe is scoped to the offlineSessionId decoded from the caller's own
    // presented token, so it never confirms or denies a jobId the caller
    // doesn't already hold the grant for; an undecodable token skips the
    // probe and takes the 401 path.
    const offlineSessionId = offlineSessionIdFromToken(body.token);
    const rowExists =
      offlineSessionId !== "" &&
      (await prisma.jobLedgerEntry.findFirst({
        where: { jobId: body.jobId, offlineSessionId },
        select: { jobId: true },
      })) !== null;
    return rowExists
      ? jsonError(403, "The job-scoped grant is expired or revoked.")
      : jsonError(401, "The job-scoped grant is expired or revoked.");
  }

  console.info(`${label} refreshed token for job ${body.jobId}`);

  const verified = await verifyJobToken(refreshedToken);
  if (!verified) {
    console.warn(`${label} verification failed for job ${body.jobId}`);
    return jsonError(401, "The job-scoped token failed verification.");
  }

  const orgKeys = readOrganizationClaimKeys(verified);

  console.info(
    `${label} verified token for job ${body.jobId}, sub=${verified.sub}, org keys=${JSON.stringify([...orgKeys])}`,
  );

  // A token with no organization claim at all is malformed.
  if (orgKeys.size === 0) {
    console.warn(`${label} 403: organization missing from token claims for job ${body.jobId}`);
    return jsonError(403, "Organization missing from token claims.");
  }

  // The request organization is resolved from the ledger row recorded at
  // submission: a user who belongs to multiple Keycloak organizations gets
  // a multi-key `organization` claim, and the row's org selects the tenant
  // this job actually belongs to. The row's org must be among the token's
  // org memberships and the row must belong to the submitting user; a
  // single message avoids leaking which check failed.
  const entry = await prisma.jobLedgerEntry.findFirst({
    where: {
      jobId: body.jobId,
      owner: verified.sub,
      organization: { in: [...orgKeys] },
    },
  });
  if (!entry) {
    console.warn(
      `${label} 403: no ledger row for job=${body.jobId} matching the token's ` +
        `org keys or owner`,
    );
    return jsonError(403, "No active job binding for this token.");
  }

  const requestData = hostRequestDataFromJobToken(verified, refreshedToken, entry.organization);

  return withHostRequestContext(requestData, async () => {
    try {
      if (!entry.roleArn) {
        console.warn(`${label} 403: roleArn empty for job ${body.jobId}`);
        return jsonError(403, "Job predates role recording; re-submit the job.");
      }

      const inputTargets: S3Target[] = (entry.inputS3Uris ?? [])
        .map(parseS3Uri)
        .filter((t): t is S3Target => t !== null);
      const outputTarget = entry.outputS3Uri ? parseS3Uri(entry.outputS3Uri) : null;

      let policy: string | undefined;
      if (outputTarget) {
        try {
          policy = buildBrokerSessionPolicy({
            inputs: inputTargets,
            output: outputTarget,
            region: entry.region,
          });
        } catch (err) {
          if (err instanceof InlinePolicySizeError) {
            console.warn(
              `${label} session policy too large (${err.message}) for job ${body.jobId}; ` +
                "omitting inline policy — the role's attached policies govern access",
            );
          } else {
            throw err;
          }
        }
      }

      let credentials;
      try {
        credentials = await assumeRoleWithWebIdentity({
          roleArn: entry.roleArn,
          roleSessionName: sanitizeRoleSessionName(`broker-${verified.sub}`),
          webIdentityToken: refreshedToken,
          region: entry.region,
          endpoint: entry.s3Endpoint,
          policy,
        });
      } catch (err) {
        // STS's PackedPolicyTooLargeException fires when the inline policy
        // plus the role's attached managed policies exceed the total packed
        // limit — even when the inline policy alone is under 2048 chars.
        // Retry without the inline policy; the role's managed policies
        // still govern access (the inline policy is a narrowing filter).
        if (
          err instanceof Error &&
          (/PackedPolicyTooLarge|packed policy/i.test(err.name) ||
            /Packed policy/i.test(err.message))
        ) {
          console.warn(
            `${label} STS rejected inline policy as too large for job ${body.jobId}; ` +
              "retrying without inline policy — the role's attached policies govern access",
          );
          credentials = await assumeRoleWithWebIdentity({
            roleArn: entry.roleArn,
            roleSessionName: sanitizeRoleSessionName(`broker-${verified.sub}`),
            webIdentityToken: refreshedToken,
            region: entry.region,
            endpoint: entry.s3Endpoint,
          });
        } else {
          throw err;
        }
      }

      const result: BrokerResponse = {
        accessKeyId: credentials.AccessKeyId,
        secretAccessKey: credentials.SecretAccessKey,
        sessionToken: credentials.SessionToken ?? "",
        expiration:
          credentials.Expiration?.toISOString() ?? new Date(Date.now() + 3600_000).toISOString(),
        refreshToken: newRefreshToken,
      };

      console.info(`${label} minted credentials for job ${body.jobId}`);
      return Response.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Broker denied the request";
      console.error(`${label} denied request for job ${body.jobId}:`, message);
      return jsonError(403, message);
    }
  });
}
