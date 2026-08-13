import type { ActionFunctionArgs } from "react-router";

import { hostRequestDataFromJobToken } from "~/.server/auth/carveOutRequestContext";
import { refreshJobToken } from "~/.server/auth/refreshJobToken";
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
    const refreshed = await refreshJobToken(body.token);
    refreshedToken = refreshed.accessToken;
    newRefreshToken = refreshed.newRefreshToken;
  } catch {
    return jsonError(401, "The job-scoped grant is expired or revoked.");
  }

  const verified = await verifyJobToken(refreshedToken);
  if (!verified) {
    return jsonError(401, "The job-scoped token failed verification.");
  }

  const requestData = hostRequestDataFromJobToken(verified, refreshedToken);

  return withHostRequestContext(requestData, async () => {
    try {
      if (!requestData.user.organization) {
        return jsonError(403, "Organization missing from token claims.");
      }

      const entry = await prisma.jobLedgerEntry.findFirst({
        where: { organization: requestData.user.organization, jobId: body.jobId },
      });
      if (!entry) {
        return jsonError(403, "No active job binding for this token.");
      }
      if (!entry.roleArn) {
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
            return jsonError(500, "Session policy size ceiling exceeded.");
          }
          throw err;
        }
      }

      const credentials = await assumeRoleWithWebIdentity({
        roleArn: entry.roleArn,
        roleSessionName: sanitizeRoleSessionName(`broker-${verified.sub}`),
        webIdentityToken: refreshedToken,
        region: entry.region,
        endpoint: entry.s3Endpoint,
        policy,
      });

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
