import type { ActionFunctionArgs } from "react-router";

import { jobTokenHostRequestData } from "~/.server/auth/carveOutRequestContext";
import { resolveBatchAccessToken } from "~/.server/auth/jobCredentialStore";
import { JobGrantRefusedError } from "~/.server/auth/refreshJobToken";
import { resolveJobBinding } from "~/.server/auth/resolveJobBinding";
import {
  buildBrokerSessionPolicy,
  InlinePolicySizeError,
  parseS3Uri,
  type S3Target,
} from "~/.server/auth/sessionPolicy";
import { withHostRequestContext } from "~/.server/hostRequestContext";
import { jsonError } from "~/.server/httpResponse";
import { createLabel } from "~/.server/logging";
import { assumeRoleWithWebIdentity, sanitizeRoleSessionName } from "~/.server/stsSession";

/**
 * A refusal from the identity service means the grant is gone; anything else —
 * the refresh lock timing out, a database or network fault — is a condition of
 * this deployment, and the caller's to retry. Keycloak answers a rejected
 * refresh with a 4xx, which `refreshJobToken` folds into the error message.
 */
function isGrantRefusal(err: unknown): boolean {
  return err instanceof JobGrantRefusedError;
}

/**
 * Credential-broker endpoint: a running container calls this host-owned route
 * with its own job session token to obtain short-lived S3 storage credentials.
 * The token is the whole of the caller's authority — the request carries no
 * other field, and the broker resolves the token to the ledger row it was
 * issued for. From there it is purely ledger-driven: the storage role ARN,
 * region, S3 endpoint, and the analysis's input/output targets all come from
 * that row, with no provider catalog or connection query at mint time.
 */

const label = createLabel("broker", "cyan");

interface BrokerRequestBody {
  token: string;
}

interface BrokerResponse {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: string;
}

export async function action(args: ActionFunctionArgs): Promise<Response> {
  let body: BrokerRequestBody;
  try {
    body = (await args.request.json()) as BrokerRequestBody;
  } catch {
    return jsonError(400, "Invalid request body");
  }

  if (typeof body.token !== "string" || body.token.length === 0) {
    return jsonError(400, "token is required");
  }

  const binding = await resolveJobBinding(body.token);
  if (!binding) {
    // No ledger row for this token: the job is unknown, cancelled, or already
    // swept after a terminal state. Nothing downstream can be scoped, so no
    // request field is ever consulted for a fallback.
    console.warn(`${label} 403: presented token resolves to no ledger row`);
    return jsonError(403, "No active job binding for this token.");
  }

  // The same context builder the job-token carve-out dispatch uses, so the
  // broker and that dispatch cannot disagree about the identity a resolved
  // binding produces.
  const requestData = jobTokenHostRequestData(binding);

  return withHostRequestContext(requestData, async () => {
    try {
      // The row the resolver returned, not a second fetch: a sweep between the
      // two would race, and re-reading only narrows a window the caller cannot
      // observe.
      const entry = binding.row;

      if (!entry.roleArn) {
        console.warn(`${label} 403: roleArn empty for job ${entry.jobId}`);
        return jsonError(403, "Job predates role recording; re-submit the job.");
      }

      // Refreshed only when the batch's held access token is missing or stale.
      // A row predating the credentials table has no batch, so it has nothing
      // to mint with.
      if (!entry.batchId) {
        console.warn(`${label} 403: job ${entry.jobId} has no batch to mint for`);
        return jsonError(403, "This job predates batch credential recording; re-submit it.");
      }

      let accessToken: string | null;
      try {
        accessToken = await resolveBatchAccessToken(entry.batchId);
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown";
        console.warn(`${label} refresh failed for job ${entry.jobId}: ${message}`);
        // Only the identity service refusing the refresh means the grant is
        // gone, and only that is non-retryable: a lock, database, or network
        // fault here says nothing about the grant, so the caller is told to
        // retry rather than to give up. Reporting the second as the first
        // would fail every job of a batch on a momentary hiccup.
        return isGrantRefusal(err)
          ? jsonError(403, "The job-scoped grant is expired or revoked.")
          : jsonError(503, "The credential broker is temporarily unavailable.");
      }

      if (!accessToken) {
        // The row is live but the batch holds no credentials: the grant lapsed
        // or was revoked between the row check and the read. Distinct from the
        // 403 below so a caller can tell "revoked" from "nothing left to mint
        // with"; both are terminal, and a transport failure stays a transport
        // failure the caller may retry.
        console.warn(`${label} 401: no credential record for batch of job ${entry.jobId}`);
        return jsonError(401, "The job-scoped grant is expired or revoked.");
      }

      const inputTargets: S3Target[] = (entry.inputS3Uris ?? [])
        .map(parseS3Uri)
        .filter((target): target is S3Target => target !== null);
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
              `${label} session policy too large (${err.message}) for job ${entry.jobId}; ` +
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
          roleSessionName: sanitizeRoleSessionName(`broker-${entry.owner}`),
          webIdentityToken: accessToken,
          region: entry.region,
          endpoint: entry.s3Endpoint,
          policy,
        });
      } catch (err) {
        // STS's PackedPolicyTooLargeException fires when the inline policy plus
        // the role's attached managed policies exceed the total packed limit —
        // even when the inline policy alone is under 2048 chars. Retry without
        // the inline policy; the role's managed policies still govern access
        // (the inline policy is a narrowing filter).
        if (
          err instanceof Error &&
          (/PackedPolicyTooLarge|packed policy/i.test(err.name) ||
            /Packed policy/i.test(err.message))
        ) {
          console.warn(
            `${label} STS rejected inline policy as too large for job ${entry.jobId}; ` +
              "retrying without inline policy — the role's attached policies govern access",
          );
          credentials = await assumeRoleWithWebIdentity({
            roleArn: entry.roleArn,
            roleSessionName: sanitizeRoleSessionName(`broker-${entry.owner}`),
            webIdentityToken: accessToken,
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
      };

      console.info(`${label} minted credentials for job ${entry.jobId}`);
      return Response.json(result);
    } catch (err) {
      // Everything reaching here is a fault on our side — STS refusing or
      // unreachable, a policy-composition bug, the ledger read. None of it says
      // the job's authorization is gone, so a terminal 403 would make a
      // container abandon a valid job. The caller gets a retryable status and a
      // fixed message; the detail goes to the host log, never to the container.
      const message = err instanceof Error ? err.message : String(err);
      console.error(`${label} mint failed for job ${binding.providerJobId}:`, message);
      return jsonError(503, "The credential broker is temporarily unavailable.");
    }
  });
}
