import type { ActionFunctionArgs } from "react-router";

import { hostRequestDataFromJobToken } from "~/.server/auth/carveOutRequestContext";
import {
  buildBrokerSessionPolicy,
  InlinePolicySizeError,
  parseS3Uri,
  type S3Target,
} from "~/.server/auth/sessionPolicy";
import { verifyJobToken } from "~/.server/auth/verifyJobToken";
import { prisma } from "~/.server/db/prisma";
import { withHostRequestContext } from "~/.server/hostRequestContext";
import { createLabel } from "~/.server/logging";
import { getS3ProviderConfig } from "~/utils/s3Provider";

/**
 * Credential-broker endpoint (SRS-CY-416102, SDS-CY-080400). A running
 * container calls this host-owned route with its job-scoped token to obtain
 * short-lived S3 storage credentials. The broker is purely ledger-driven:
 * it reads the storage role ARN, region, S3 endpoint, and the analysis's
 * input/output targets from the ledger row recorded at submission — no
 * provider catalog call, no connection query, no admin-portal dependency
 * at mint time (SRS-CY-416103, SRS-CY-416105).
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
}

function deny(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

export async function action(args: ActionFunctionArgs): Promise<Response> {
  let body: BrokerRequestBody;
  try {
    body = (await args.request.json()) as BrokerRequestBody;
  } catch {
    return deny(400, "Invalid request body");
  }

  if (!body.token || !body.jobId) {
    return deny(400, "token and jobId are required");
  }

  const verified = await verifyJobToken(body.token);
  if (!verified) {
    return deny(401, "The job-scoped token failed verification.");
  }

  const requestData = hostRequestDataFromJobToken(verified, body.token);

  return withHostRequestContext(requestData, async () => {
    try {
      if (!requestData.user.organization) {
        return deny(403, "Organization missing from token claims.");
      }

      const entry = await prisma.jobLedgerEntry.findFirst({
        where: { organization: requestData.user.organization, jobId: body.jobId },
      });
      if (!entry) {
        return deny(403, "No active job binding for this token.");
      }
      if (!entry.roleArn) {
        return deny(403, "Job predates role recording; re-submit the job.");
      }

      const inputTargets: S3Target[] = (entry.inputS3Uris ?? [])
        .map(parseS3Uri)
        .filter((t): t is S3Target => t !== null);
      const outputTarget = entry.outputS3Uri ? parseS3Uri(entry.outputS3Uri) : null;

      let Policy: string | undefined;
      if (outputTarget) {
        try {
          Policy = buildBrokerSessionPolicy({
            inputs: inputTargets,
            output: outputTarget,
            region: entry.region,
          });
        } catch (err) {
          if (err instanceof InlinePolicySizeError) {
            return deny(500, "Session policy size ceiling exceeded.");
          }
          throw err;
        }
      }

      const providerConfig = getS3ProviderConfig(entry.s3Endpoint, entry.region);
      const { STSClient, AssumeRoleWithWebIdentityCommand } = await import("@aws-sdk/client-sts");
      const stsClient = new STSClient({
        endpoint: providerConfig.stsEndpoint,
        region: entry.region,
      });

      const roleSessionName = `broker-${verified.sub}`.replace(/[^\w+=,.@-]/g, "-").slice(0, 64);

      const { Credentials } = await stsClient.send(
        new AssumeRoleWithWebIdentityCommand({
          RoleArn: entry.roleArn,
          RoleSessionName: roleSessionName,
          WebIdentityToken: body.token,
          DurationSeconds: 3600,
          ...(Policy ? { Policy } : {}),
        }),
      );

      if (!Credentials?.AccessKeyId || !Credentials?.SecretAccessKey) {
        return deny(503, "STS returned no credentials.");
      }

      const result: BrokerResponse = {
        accessKeyId: Credentials.AccessKeyId,
        secretAccessKey: Credentials.SecretAccessKey,
        sessionToken: Credentials.SessionToken ?? "",
        expiration:
          Credentials.Expiration?.toISOString() ?? new Date(Date.now() + 3600_000).toISOString(),
      };

      console.info(`${label} minted credentials for job ${body.jobId}`);
      return Response.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Broker denied the request";
      console.error(`${label} denied request for job ${body.jobId}:`, message);
      return deny(403, message);
    }
  });
}
