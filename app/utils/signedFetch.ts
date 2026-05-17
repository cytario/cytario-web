import { Sha256 } from "@aws-crypto/sha256-browser";
import type { Credentials } from "@aws-sdk/client-sts";
import { SignatureV4 } from "@smithy/signature-v4";

import type { ConnectionConfig } from "~/.generated/client";
import { sanitizeHeaders } from "~/utils/sanitizeHeaders";

export type SignedFetch = (url: string, init?: RequestInit) => Promise<Response>;

// Image tile/chunk bytes are immutable per object version → 7-day cache.
const IMAGE_DATA_CACHE_CONTROL = "private, max-age=604800";

// Sidecars, overlays, JSON companions → 1-hour ceiling so analyst
// regenerations surface without an explicit purge.
const OTHER_DATA_CACHE_CONTROL = "private, max-age=3600";

// TIFF/OME-TIFF reads, or OME-Zarr chunks whose last path segment is digits
// only (`image.zarr/0/0/0` or `image.zarr/0.0.0`).
function isImageDataPath(pathname: string): boolean {
  return /\.tiff?$/i.test(pathname) || /\/\d+(?:\.\d+)*$/.test(pathname);
}

/**
 * SigV4-signing fetch. Credentials are resolved lazily per call so the signer
 * is recreated when AccessKeyId rotates. Every GET injects a
 * `response-cache-control` query override so the storage backend echoes a
 * Cache-Control directive — the browser HTTP cache then serves repeat reads
 * without a network round-trip.
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
      throw new Error("Invalid credentials: AccessKeyId and SecretAccessKey are required");
    }

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

    // Decode so the signer can re-encode canonically — without this,
    // percent-encoded chars get double-encoded and the signature breaks.
    const decodedPath = decodeURIComponent(parsed.pathname);

    const cacheControl = isImageDataPath(parsed.pathname)
      ? IMAGE_DATA_CACHE_CONTROL
      : OTHER_DATA_CACHE_CONTROL;

    // Only the host header is signed — Range etc. pass through unsigned to
    // avoid CORS/signature mismatches. Caller-supplied headers run through
    // sanitizeHeaders, and the merge order below puts signed headers LAST
    // so a bypass of sanitizeHeaders still cannot override the signature.
    const callerHeaders = sanitizeHeaders(init?.headers as Record<string, string> | undefined);

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
        ...callerHeaders,
        ...(signed.headers as Record<string, string>),
      },
      signal: init?.signal,
    });
  };
}
