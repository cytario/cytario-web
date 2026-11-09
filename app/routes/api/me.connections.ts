import { type LoaderFunctionArgs } from "react-router";

import { pickGrantForUser } from "~/.server/auth/getSessionCredentials";
import { profileFromTokenClaims } from "~/.server/auth/getUserInfo";
import { verifyCliToken } from "~/.server/auth/verifyCliToken";
import { jsonError } from "~/.server/httpResponse";
import { getBucketCatalog } from "~/.server/providers/bucketCatalog.server";
import {
  getProviderCatalog,
  resolveConnectionProviderWithGrants,
} from "~/.server/providers/providerCatalog.server";
import { requestDurationMiddleware } from "~/.server/requestDurationMiddleware";
import { listConnections } from "~/routes/connections/connections.server";
import { getS3ProviderConfig } from "~/utils/s3Provider";

export const middleware = [requestDurationMiddleware];

interface MeConnection {
  organization: string;
  id: string;
  name: string;
  bucketName: string;
  prefix: string;
  region: string;
  s3Endpoint: string;
  stsEndpoint: string;
  roleArn: string | null;
  accessLevel: string | null;
}

/**
 * Read endpoint for the cytario CLI: lists the token user's visible
 * connections across every organization the token carries a membership in,
 * each row tagged with its organization and carrying the resolved grant
 * (role ARN, access level, region, S3/STS endpoints) the workstation's AWS
 * CLI profile needs. Authenticated by a Bearer access token on the CLI
 * client — no browser session, no STS mint. The token is forwarded to the
 * portal catalog lookups, which exchange it (RFC 8693) to resolve each
 * organization. Backward-compatible: the response stays `{ connections }`;
 * rows only gained the `organization` field.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const authHeader = request.headers.get("Authorization") ?? "";
  const [scheme, token] = authHeader.split(" ", 2);
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return jsonError(401, "A Bearer access token on the cytario CLI client is required.");
  }

  const payload = await verifyCliToken(token);
  if (!payload) {
    return jsonError(401, "The presented token is invalid or expired.");
  }

  const profile = profileFromTokenClaims(payload);
  // Fail closed on a zero-org token, as before — no org can be resolved.
  if (!profile || Object.keys(profile.organizations).length === 0) {
    return jsonError(401, "The token carries no organization to act in.");
  }
  // Sorted for a deterministic row order across orgs; `listConnections`
  // orders an org's own rows by name.
  const organizations = Object.keys(profile.organizations).sort();

  const rows = (
    await Promise.all(
      organizations.map(async (organization) => {
        const connections = await listConnections(profile, organization);

        const catalog = await getProviderCatalog(organization, token).catch((error: unknown) => {
          console.error("[me/connections] provider catalog lookup failed", error);
          return undefined;
        });
        const bucketCatalog = await getBucketCatalog(organization, token).catch(() => undefined);

        // A full lookup failure must surface as a clear error, never as an
        // empty connection list.
        if (!catalog) {
          return jsonError(
            502,
            "The storage provider catalog is currently unavailable — try again shortly.",
          );
        }

        const orgRows = await Promise.all(
          connections.map(async (connection): Promise<MeConnection | null> => {
            const resolved = resolveConnectionProviderWithGrants(
              catalog,
              connection,
              bucketCatalog,
            );
            if (!resolved) return null;
            const grant = pickGrantForUser(resolved, profile, organization);

            const bucketRow = bucketCatalog?.buckets.find(
              (b) =>
                b.bucketName === connection.bucketName &&
                catalog.providerConnections.some((p) => p.id === b.providerConnectionId),
            );
            const region = bucketRow?.region ?? resolved.region;
            const providerConfig = getS3ProviderConfig(resolved.endpoint, region);

            return {
              organization,
              id: connection.id,
              name: connection.name,
              bucketName: connection.bucketName,
              prefix: connection.prefix ?? "",
              region,
              s3Endpoint: providerConfig.s3Endpoint,
              stsEndpoint: providerConfig.stsEndpoint,
              roleArn: grant?.roleArn ?? null,
              accessLevel: grant?.accessLevel ?? null,
            };
          }),
        );
        return orgRows.filter((c): c is MeConnection => c !== null);
      }),
    )
  ).flat();

  return Response.json({ connections: rows }, { headers: { "Cache-Control": "no-store" } });
};
