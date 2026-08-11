import type { ActionFunctionArgs } from "react-router";

import { hostRequestDataFromJobToken } from "~/.server/auth/carveOutRequestContext";
import { buildBrokerSessionPolicy, InlinePolicySizeError } from "~/.server/auth/sessionPolicy";
import { verifyJobToken } from "~/.server/auth/verifyJobToken";
import { prisma } from "~/.server/db/prisma";
import { withHostRequestContext } from "~/.server/hostRequestContext";
import { createLabel } from "~/.server/logging";
import {
  getProviderCatalog,
  resolveConnectionProvider,
} from "~/.server/providers/providerCatalog.server";
import { listConnections } from "~/routes/connections/connections.server";
import { getS3ProviderConfig } from "~/utils/s3Provider";

/**
 * Credential-broker endpoint (SRS-CY-416102, SDS-CY-080400).
 *
 * A running analysis container calls this host-owned route with its
 * job-scoped token to obtain short-lived S3 storage credentials. The
 * broker verifies the token, checks the running-jobs ledger for an
 * active row, resolves a storage role from the org's connections, and
 * mints ≤ 1-hour credentials via `AssumeRoleWithWebIdentity` (SRS-CY-416103).
 *
 * This is a first-class host route, not a plugin-contributed endpoint —
 * credential minting is host infrastructure, not image-processing domain
 * logic. The compute-plugin's job adapter tells the container the broker
 * endpoint URL; the container (via the SDK) calls it directly.
 *
 * Request body: `{ token: string, jobId: string, s3Uri?: string }`.
 * The `s3Uri` is optional — when present, the broker validates it against
 * the org's connected storage and scopes the session policy to it; when
 * absent, the broker mints against the org's first storage connection with
 * no session policy (the role's attached policy + bucket policy are the
 * boundary). A future SDK change sends the s3Uri to tighten the scope.
 */

const label = createLabel("broker", "cyan");

interface BrokerRequestBody {
  token: string;
  jobId: string;
  s3Uri?: string;
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

/** Parse an `s3://bucket/prefix` URI into its bucket and key prefix. */
function parseS3Uri(uri: string): { bucketName: string; prefix: string } | null {
  try {
    const url = new URL(uri);
    if (url.protocol !== "s3:") return null;
    const bucketName = url.host;
    if (!bucketName) return null;
    const prefix = url.pathname.replace(/^\/+/, "");
    return { bucketName, prefix };
  } catch {
    return null;
  }
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
      // (c) Ledger-gated revocation signal: a broker call whose job has no
      // active ledger row mints nothing (SRS-CY-416102(c)).
      if (!requestData.user.organization) {
        return deny(403, "Organization missing from token claims.");
      }

      const ledgerEntry = await prisma.jobLedgerEntry.findFirst({
        where: { organization: requestData.user.organization, jobId: body.jobId },
      });
      if (!ledgerEntry) {
        return deny(403, "No active job binding for this token.");
      }

      // Resolve a storage connection + role from the org's connected storage.
      // The token's org claim authorizes; the s3Uri (when present) selects
      // the target within the permitted scope but does not widen it
      // (SRS-CY-416102(b)).
      const connections = await listConnections(requestData.user);
      if (connections.length === 0) {
        return deny(403, "No connected storage for this organization.");
      }

      const targetUri = body.s3Uri ? parseS3Uri(body.s3Uri) : null;
      const targetConnection = targetUri
        ? connections.find((c) => c.bucketName === targetUri.bucketName)
        : connections[0];

      if (!targetConnection) {
        return deny(
          403,
          "The target storage URI is outside this organization's connected storage.",
        );
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

      // Build the session policy scoped to the target prefix (SRS-CY-416103).
      // When s3Uri is absent, mint without a session policy — the role's
      // attached policy + bucket policy are the boundary (SRS-CY-43106
      // gates (a) and (c)).
      const providerConfig = getS3ProviderConfig(resolved.endpoint, resolved.region);
      let Policy: string | undefined;
      if (targetUri) {
        try {
          Policy = buildBrokerSessionPolicy({
            bucketName: targetConnection.bucketName,
            prefix: targetUri.prefix,
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
