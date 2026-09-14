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
 * connections with the resolved grant (role ARN, access level, region,
 * S3/STS endpoints) the workstation's AWS CLI profile needs. Authenticated
 * by a Bearer ID token on the CLI client — no browser session, no STS mint;
 * the CLI's own tooling performs AssumeRoleWithWebIdentity with the profile.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const authHeader = request.headers.get("Authorization") ?? "";
  const [scheme, token] = authHeader.split(" ", 2);
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return jsonError(401, "A Bearer ID token on the cytario CLI client is required.");
  }

  const payload = await verifyCliToken(token);
  if (!payload) {
    return jsonError(401, "The presented token is invalid or expired.");
  }

  const user = profileFromTokenClaims(payload);
  if (!user?.organization) {
    return jsonError(401, "The token carries no single active organization.");
  }
  const organization = user.organization;

  const connections = await listConnections(user);

  const catalog = await getProviderCatalog(organization).catch((error: unknown) => {
    console.error("[me/connections] provider catalog lookup failed", error);
    return undefined;
  });
  const bucketCatalog = await getBucketCatalog(organization).catch(() => undefined);

  // The catalog lookup is advisory for listing, but silently dropping every
  // connection on lookup failure reads as "no connections" to the CLI. A
  // failed lookup surfaces as an explicit error instead (SRS-CY-412104).
  if (!catalog) {
    return jsonError(
      502,
      "The storage provider catalog is currently unavailable — try again shortly.",
    );
  }

  const rows = await Promise.all(
    connections.map(async (connection): Promise<MeConnection | null> => {
      const resolved = resolveConnectionProviderWithGrants(catalog, connection, bucketCatalog);
      if (!resolved) return null;
      const grant = pickGrantForUser(resolved, user, organization);

      const bucketRow = bucketCatalog?.buckets.find(
        (b) =>
          b.bucketName === connection.bucketName &&
          catalog.providerConnections.some((p) => p.id === b.providerConnectionId),
      );
      const region = bucketRow?.region ?? resolved.region;
      const providerConfig = getS3ProviderConfig(resolved.endpoint, region);

      return {
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

  return Response.json(
    { connections: rows.filter((c): c is MeConnection => c !== null) },
    { headers: { "Cache-Control": "no-store" } },
  );
};
