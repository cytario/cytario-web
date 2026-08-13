import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { type ActionFunctionArgs } from "react-router";

import { authContext, authMiddleware } from "~/.server/auth/authMiddleware";
import { pickGrantForUser } from "~/.server/auth/getSessionCredentials";
import {
  getProviderCatalog,
  resolveConnectionProviderWithGrants,
} from "~/.server/providers/providerCatalog.server";
import { requestDurationMiddleware } from "~/.server/requestDurationMiddleware";
import { getConnection } from "~/routes/connections/connections.server";
import { type BucketAddress, constructS3Url } from "~/utils/resourceId";
import { isAllowedS3Host } from "~/utils/s3HostAllowlist";
import { getS3ProviderConfig } from "~/utils/s3Provider";

export const middleware = [requestDurationMiddleware, authMiddleware];

const DEFAULT_SIGNING_EXPIRES_SECONDS = 900;

interface PresignRequestBody {
  connectionId: string;
  url: string;
  method: string;
}

/**
 * Dev-only SSRF carve-out: `isAllowedS3Host` is https-only by design, but the
 * local rclone `serve s3` endpoint runs on `http://localhost:<port>`. Allow
 * plain-http localhost in development so presigned URLs can be tested locally.
 */
function isDevLocalhost(url: string): boolean {
  if (process.env.NODE_ENV !== "development") return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:") return false;
    return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

/**
 * Verify the requested URL's origin and bucket match what `constructS3Url`
 * would build for this connection — prevents a user from presigning a URL
 * for a different bucket via the same connection.
 */
function validateUrlMatchesConnection(
  s3Url: string,
  address: BucketAddress,
): { bucket: string; key: string } | { error: string } {
  const expectedBase = constructS3Url(address);
  const expected = new URL(expectedBase);
  let parsed: URL;
  try {
    parsed = new URL(s3Url);
  } catch {
    return { error: "Invalid S3 URL" };
  }

  if (parsed.protocol !== expected.protocol) {
    return { error: "URL protocol does not match the connection endpoint" };
  }
  if (parsed.host !== expected.host) {
    return { error: "URL host does not match the connection endpoint" };
  }

  const pathSegments = parsed.pathname.replace(/^\/+/, "").split("/").filter(Boolean);
  const bucket = pathSegments.shift() ?? "";
  if (bucket !== address.bucketName) {
    return { error: "URL bucket does not match the connection bucket" };
  }
  const key = pathSegments.join("/");
  return { bucket, key };
}

/**
 * Enforce PUT write-scoping based on the user's access level:
 * - `read-only` → deny all PUTs
 * - `annotate`  → only `*.annotations.<sub>.json` under the connection prefix
 * - `read-write`/`admin` → anything under the prefix
 */
function validatePutScope(
  key: string,
  prefix: string | null | undefined,
  accessLevel: "read-only" | "annotate" | "read-write" | "admin",
  subject: string,
): string | null {
  if (accessLevel === "read-only") {
    return "Your access level does not permit writes to this connection";
  }
  if (accessLevel === "annotate") {
    const cleanPrefix = prefix?.replace(/^\/+|\/+$/g, "") ?? "";
    const expectedSuffix = `.annotations.${subject}.json`;
    if (!key.endsWith(expectedSuffix)) {
      return "Annotate-level writes are limited to annotation sidecar files";
    }
    if (cleanPrefix && !key.startsWith(`${cleanPrefix}/`)) {
      return "Write key is outside the connection prefix";
    }
  }
  // read-write / admin: allow any key under the prefix
  const cleanPrefix = prefix?.replace(/^\/+|\/+$/g, "") ?? "";
  if (cleanPrefix && !key.startsWith(`${cleanPrefix}/`)) {
    return "Write key is outside the connection prefix";
  }
  return null;
}

// Tile/chunk bytes are immutable per object version → 7-day cache.
const IMAGE_DATA_CACHE_CONTROL = "private, max-age=604800";

// Sidecars / overlays / JSON companions → 1-hour ceiling.
const OTHER_DATA_CACHE_CONTROL = "private, max-age=3600";

function isImageDataPath(pathname: string): boolean {
  return /\.tiff?$/i.test(pathname) || /\/\d+(?:\.\d+)*$/.test(pathname);
}

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { user, authTokens } = context.get(authContext);

  let body: PresignRequestBody;
  try {
    body = (await request.json()) as PresignRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { connectionId, url: s3Url, method } = body;
  if (!connectionId || !s3Url || !method) {
    return Response.json({ error: "connectionId, url, and method are required" }, { status: 400 });
  }

  // getConnection already enforces canSee (tenant boundary + scope visibility).
  const connectionConfig = await getConnection(user, connectionId);
  if (!connectionConfig) {
    return Response.json({ error: "Connection not found" }, { status: 404 });
  }

  let resolvedWithGrants;
  try {
    const catalog = await getProviderCatalog(connectionConfig.organization, authTokens.accessToken);
    resolvedWithGrants = resolveConnectionProviderWithGrants(catalog, connectionConfig);
  } catch {
    return Response.json({ error: "Provider catalog is unavailable" }, { status: 502 });
  }

  if (!resolvedWithGrants) {
    return Response.json({ error: "Provider connection is stale or unavailable" }, { status: 502 });
  }

  if (resolvedWithGrants.credentialMode !== "presigned") {
    return Response.json({ error: "This connection does not use presigned URLs" }, { status: 400 });
  }

  const { staticCredentials, region, endpoint } = resolvedWithGrants;
  if (!staticCredentials) {
    return Response.json(
      { error: "No static credentials configured for this presigned connection" },
      { status: 502 },
    );
  }

  // Pick the user's grant to determine their access level (for PUT write-scoping).
  const grant = pickGrantForUser(resolvedWithGrants, user, connectionConfig.organization);
  if (!grant) {
    return Response.json(
      { error: "You are not a member of any group granted access to this connection" },
      { status: 403 },
    );
  }

  // SSRF guard: the URL must be in the S3 host allowlist (or dev localhost).
  if (!isAllowedS3Host(s3Url) && !isDevLocalhost(s3Url)) {
    return Response.json({ error: "Host is not in the S3 allowlist" }, { status: 403 });
  }

  // URL validation: origin + bucket must match the connection.
  const address: BucketAddress = {
    bucketName: connectionConfig.bucketName,
    region,
    endpoint,
  };
  const validated = validateUrlMatchesConnection(s3Url, address);
  if ("error" in validated) {
    return Response.json({ error: validated.error }, { status: 400 });
  }
  const { bucket, key } = validated;

  const upperMethod = method.toUpperCase();

  // PUT write-scoping based on the user's access level.
  if (upperMethod === "PUT") {
    const scopeError = validatePutScope(key, connectionConfig.prefix, grant.accessLevel, user.sub);
    if (scopeError) {
      return Response.json({ error: scopeError }, { status: 403 });
    }
  }

  const providerConfig = getS3ProviderConfig(endpoint, region);
  const s3Client = new S3Client({
    endpoint: providerConfig.s3Endpoint,
    region,
    forcePathStyle: !providerConfig.isAwsS3,
    credentials: {
      accessKeyId: staticCredentials.accessKeyId,
      secretAccessKey: staticCredentials.secretAccessKey,
    },
  });

  const parsedUrl = new URL(s3Url);
  const params = parsedUrl.searchParams;
  const isRead = upperMethod === "GET" || upperMethod === "HEAD";

  const signingOptions = {
    expiresIn: DEFAULT_SIGNING_EXPIRES_SECONDS,
    ...(isRead
      ? {
          unhoistableHeaders: new Set(["response-cache-control"]),
        }
      : {}),
  };

  const cacheControl = isImageDataPath(parsedUrl.pathname)
    ? IMAGE_DATA_CACHE_CONTROL
    : OTHER_DATA_CACHE_CONTROL;

  let signedUrl: string;
  try {
    if (params.get("list-type") === "2") {
      const command = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: params.get("prefix") ?? undefined,
        Delimiter: params.get("delimiter") ?? undefined,
        MaxKeys: params.get("max-keys") ? Number(params.get("max-keys")) : undefined,
        ContinuationToken: params.get("continuation-token") ?? undefined,
      });
      signedUrl = await getSignedUrl(s3Client, command, signingOptions);
    } else if (upperMethod === "PUT") {
      const command = new PutObjectCommand({ Bucket: bucket, Key: key });
      signedUrl = await getSignedUrl(s3Client, command, signingOptions);
    } else {
      // GET / HEAD — inject response-cache-control so the browser HTTP cache
      // can serve repeat reads without a network round-trip.
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ResponseCacheControl: cacheControl,
      });
      signedUrl = await getSignedUrl(s3Client, command, signingOptions);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to presign URL";
    return Response.json({ error: message }, { status: 500 });
  }

  const expiresAt = new Date(Date.now() + DEFAULT_SIGNING_EXPIRES_SECONDS * 1000).toISOString();

  return Response.json(
    { presignedUrl: signedUrl, expiresAt },
    {
      headers: { "Cache-Control": "no-store, private" },
    },
  );
};
