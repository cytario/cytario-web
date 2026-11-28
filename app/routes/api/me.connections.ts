import { type LoaderFunctionArgs } from "react-router";

import { pickGrantForUser } from "~/.server/auth/getSessionCredentials";
import { profileFromTokenClaims } from "~/.server/auth/getUserInfo";
import { verifyCliToken } from "~/.server/auth/verifyCliToken";
import { lockedConnections } from "~/.server/gateResourceFacts.server";
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
  /** Null on a locked row: the STS endpoint is half of what a client needs to
   *  mint for itself, which is what the lock refuses. */
  stsEndpoint: string | null;
  /** Null on a locked row: assuming the role is exactly the access the lock
   *  withholds (AWS-side enforcement is a separate ticket). */
  roleArn: string | null;
  accessLevel: string | null;
  /** The org's plan lists this connection without allowing it to be browsed. */
  locked: boolean;
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
 * rows only gained the `organization` field, and now `locked`.
 *
 * A locked row is listed — the CLI shows it rather than silently dropping it —
 * but withholds the grant: a role ARN and the STS endpoint are what a client
 * needs to mint its own credentials, which is exactly what the lock refuses.
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

        const resolved = connections.map((connection) => ({
          connection,
          provider: resolveConnectionProviderWithGrants(catalog, connection, bucketCatalog),
        }));

        // The gate's per-connection verdict — a locked row is still listed, so
        // the CLI shows it rather than silently dropping it.
        const lockedIds = new Set(
          (
            await lockedConnections(
              profile,
              organization,
              resolved.map(({ connection, provider }) => ({
                connectionId: connection.id,
                isPublic: provider?.isPublic,
              })),
            )
          ).map((locked) => locked.id),
        );

        const orgRows = await Promise.all(
          resolved.map(async ({ connection, provider }): Promise<MeConnection | null> => {
            if (!provider) return null;
            const locked = lockedIds.has(connection.id);
            const grant = pickGrantForUser(provider, profile, organization);

            const bucketRow = bucketCatalog?.buckets.find(
              (b) =>
                b.bucketName === connection.bucketName &&
                catalog.providerConnections.some((p) => p.id === b.providerConnectionId),
            );
            const region = bucketRow?.region ?? provider.region;
            const providerConfig = getS3ProviderConfig(provider.endpoint, region);

            return {
              organization,
              id: connection.id,
              name: connection.name,
              bucketName: connection.bucketName,
              prefix: connection.prefix ?? "",
              region,
              s3Endpoint: providerConfig.s3Endpoint,
              // The lock withholds the mint inputs, not the row: a client that
              // kept its own copy from before the downgrade is outside this
              // endpoint's reach (AWS-side enforcement is a separate ticket).
              stsEndpoint: locked ? null : providerConfig.stsEndpoint,
              roleArn: locked ? null : (grant?.roleArn ?? null),
              accessLevel: locked ? null : (grant?.accessLevel ?? null),
              locked,
            };
          }),
        );
        return orgRows.filter((c): c is MeConnection => c !== null);
      }),
    )
  ).flat();

  return Response.json({ connections: rows }, { headers: { "Cache-Control": "no-store" } });
};
