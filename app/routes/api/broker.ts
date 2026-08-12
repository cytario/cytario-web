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
import {
  getProviderCatalog,
  resolveConnectionProvider,
} from "~/.server/providers/providerCatalog.server";
import { getS3ProviderConfig } from "~/utils/s3Provider";

/**
 * Credential-broker endpoint (SRS-CY-416102, SDS-CY-080400). A running
 * container calls this host-owned route with its job-scoped token to obtain
 * short-lived S3 storage credentials. Verifies the token, checks the
 * running-jobs ledger, resolves a storage role from the org's connections,
 * and mints ≤ 1-hour credentials via `AssumeRoleWithWebIdentity`
 * (SRS-CY-416103).
 *
 * Request body: `{ token: string, jobId: string }`. The session policy is
 * scoped from the input and output targets recorded in the ledger at
 * submission — never from any caller-supplied body field.
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

      const ledgerEntry = await prisma.jobLedgerEntry.findFirst({
        where: { organization: requestData.user.organization, jobId: body.jobId },
      });
      if (!ledgerEntry) {
        return deny(403, "No active job binding for this token.");
      }

      const connections = await prisma.connectionConfig.findMany({
        where: { organization: requestData.user.organization },
        include: { grants: true },
      });
      if (connections.length === 0) {
        return deny(403, "No connected storage for this organization.");
      }

      // Parse the input and output targets from the ledger row — these were
      // server-validated at submission and are the authoritative scope.
      const inputTargets: S3Target[] = (ledgerEntry.inputS3Uris ?? [])
        .map(parseS3Uri)
        .filter((t): t is S3Target => t !== null);
      const outputTarget = ledgerEntry.outputS3Uri ? parseS3Uri(ledgerEntry.outputS3Uri) : null;

      // Resolve the output connection for the role ARN. If the output target
      // is absent (legacy row), fall back to the first connection.
      const targetConnection = outputTarget
        ? connections.find((c) => c.bucketName === outputTarget.bucketName)
        : connections[0];

      if (!targetConnection) {
        return deny(403, "The output target is outside this organization's connected storage.");
      }

      const grant = targetConnection.grants[0];
      if (!grant) {
        return deny(403, "The target connection has no configured role.");
      }

      const catalog = await getProviderCatalog(
        requestData.user.organization,
        requestData.authTokens.accessToken,
      );
      const resolved = resolveConnectionProvider(catalog, {
        providerConnectionId: targetConnection.providerConnectionId,
        providerRoleId: grant.providerRoleId,
      });
      if (!resolved) {
        return deny(503, "The connection's provider role could not be resolved.");
      }

      const providerConfig = getS3ProviderConfig(resolved.endpoint, resolved.region);

      // Build the session policy from the ledger-recorded targets. If the
      // output target is absent (legacy row), mint without a session policy —
      // the role + bucket policy are the boundary.
      let Policy: string | undefined;
      if (outputTarget) {
        try {
          Policy = buildBrokerSessionPolicy({
            inputs: inputTargets,
            output: outputTarget,
            region: resolved.region,
          });
        } catch (err) {
          if (err instanceof InlinePolicySizeError) {
            return deny(500, "Session policy size ceiling exceeded.");
          }
          throw err;
        }
      }

      const { STSClient, AssumeRoleWithWebIdentityCommand } = await import("@aws-sdk/client-sts");
      const stsClient = new STSClient({
        endpoint: providerConfig.stsEndpoint,
        region: resolved.region,
      });

      const roleSessionName = `broker-${verified.sub}`.replace(/[^\w+=,.@-]/g, "-").slice(0, 64);

      const { Credentials } = await stsClient.send(
        new AssumeRoleWithWebIdentityCommand({
          RoleArn: resolved.roleArn,
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
