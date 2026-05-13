import { Sha256 } from "@aws-crypto/sha256-browser";
import type { Credentials } from "@aws-sdk/client-sts";
import { SignatureV4 } from "@smithy/signature-v4";

import type { ConnectionConfig } from "~/.generated/client";

export type SignedFetch = (
  url: string,
  init?: RequestInit,
) => Promise<Response>;

/**
 * Cache-Control directive set on S3 GetObject responses for image data
 * (OME-TIFF tiles, OME-Zarr chunks). These bytes are effectively immutable
 * for the lifetime of an object version, so we let the chromium HTTP cache
 * (and other Cache-Control-respecting caches) keep them for a week.
 */
const IMAGE_DATA_CACHE_CONTROL = "private, max-age=604800";

/**
 * Cache-Control directive for everything else (sidecars, overlays, JSON
 * companions). Shorter ceiling so analyst regeneration surfaces within an
 * hour without an explicit purge.
 */
const OTHER_DATA_CACHE_CONTROL = "private, max-age=3600";

/**
 * Image data per URL path: TIFF / OME-TIFF tile reads, or OME-Zarr chunks
 * (last path segment is digits-only, e.g. `image.zarr/0/0/0`, or
 * `image.zarr/0.0.0`).
 */
function isImageDataPath(pathname: string): boolean {
  return (
    /\.tiff?$/i.test(pathname) || /\/\d+(?:\.\d+)*$/.test(pathname)
  );
}

/**
 * Create a fetch function that signs every request with AWS Signature V4.
 * Credentials are resolved lazily via a getter — the signer is recreated
 * automatically when the AccessKeyId changes (credential rotation).
 *
 * Every signed GET injects `response-cache-control` as a GetObject query
 * override so the storage backend echoes a Cache-Control directive on the
 * response. This lets the browser HTTP cache (chromium sparse-cache 206
 * entries; Firefox cache 200 entries) serve repeat reads without a network
 * round-trip — no application-layer cache layer is involved.
 */
export function createSignedFetch(
  getCredentials: () => Credentials,
  connectionConfig: Pick<ConnectionConfig, "region">,
): SignedFetch {
  let cachedKeyId: string | undefined;
  let signer: SignatureV4;

  return async (url: string, init?: RequestInit): Promise<Response> => {
    const credentials = getCredentials();

    if (!credentials.AccessKeyId || !credentials.SecretAccessKey) {
      throw new Error(
        "Invalid credentials: AccessKeyId and SecretAccessKey are required",
      );
    }

    // Recreate signer only when credentials rotate
    if (credentials.AccessKeyId !== cachedKeyId) {
      signer = new SignatureV4({
        credentials: {
          accessKeyId: credentials.AccessKeyId,
          secretAccessKey: credentials.SecretAccessKey,
          sessionToken: credentials.SessionToken,
        },
        region: connectionConfig.region || "eu-central-1",
        service: "s3",
        sha256: Sha256,
      });
      cachedKeyId = credentials.AccessKeyId;
    }

    const parsed = new URL(url);

    // Decode the pathname so the signer can re-encode it in canonical form.
    // Without this, percent-encoded characters (e.g. %20 for spaces) get
    // double-encoded in the canonical request, causing a signature mismatch.
    const decodedPath = decodeURIComponent(parsed.pathname);

    // Pick per-asset directive: image bytes are immutable per object version
    // (7-day cache); everything else gets the 1-hour ceiling so analyst
    // re-generations surface without an explicit cache purge.
    const cacheControl = isImageDataPath(parsed.pathname)
      ? IMAGE_DATA_CACHE_CONTROL
      : OTHER_DATA_CACHE_CONTROL;

    // Only sign the host header — additional headers like Range are passed
    // through unsigned to avoid CORS/signature mismatch issues. Query params
    // are passed as a separate `query` field; smithy ignores anything in
    // `path` after `?` when canonicalizing.
    const callerHeaders = (init?.headers as Record<string, string>) ?? {};

    const request = {
      method: (init?.method as string) ?? "GET",
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port ? parseInt(parsed.port) : undefined,
      path: decodedPath,
      query: { "response-cache-control": cacheControl },
      headers: {
        host: parsed.host,
      },
    };

    const signed = await signer.sign(request);

    const wireUrl = `${parsed.origin}${parsed.pathname}?response-cache-control=${encodeURIComponent(cacheControl)}`;

    return fetch(wireUrl, {
      ...init,
      method: request.method,
      headers: {
        ...(signed.headers as Record<string, string>),
        ...callerHeaders,
      },
      signal: init?.signal,
    });
  };
}
