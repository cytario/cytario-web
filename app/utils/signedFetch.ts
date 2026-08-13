import { Sha256 } from "@aws-crypto/sha256-browser";
import type { Credentials } from "@aws-sdk/client-sts";
import { SignatureV4 } from "@smithy/signature-v4";

import { ExpiredCredentialsError, requestCredentialsRefresh } from "~/utils/credentialsRefresh";
import { sanitizeHeaders } from "~/utils/sanitizeHeaders";

export type SignedFetch = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Lowercase header names the SigV4 signer emits. The CORS probe lists these
 * in `Access-Control-Request-Headers` so the OPTIONS preflight carries the
 * same set as the eventual GET. Keep in sync with `signer.sign` below.
 */
export const SIGNED_REQUEST_HEADERS = [
  "authorization",
  "x-amz-content-sha256",
  "x-amz-date",
  "x-amz-security-token",
] as const;

/**
 * Thrown when a browser fetch fails before a Response — almost always a
 * CORS misconfiguration on the bucket. Caller error paths instanceof-check
 * this to surface a dedicated toast.
 */
export class CorsLikelyError extends Error {
  public readonly host: string;
  public readonly origin: string;

  constructor(host: string, origin: string, cause?: unknown) {
    super(
      `Browser was blocked from reading "${host}" — likely a CORS misconfiguration on the bucket.`,
    );
    this.name = "CorsLikelyError";
    this.host = host;
    this.origin = origin;
    if (cause !== undefined) {
      (this as { cause?: unknown }).cause = cause;
    }
  }
}

function isLikelyCorsFailure(error: unknown): boolean {
  if (!(error instanceof TypeError)) return false;
  const message = error.message ?? "";
  return (
    message.includes("Failed to fetch") ||
    message.includes("Load failed") ||
    message.includes("NetworkError when attempting to fetch resource") ||
    message.includes("NetworkError")
  );
}

function isRetriableGet(init: RequestInit): boolean {
  const method = (init.method ?? "GET").toUpperCase();
  return (method === "GET" || method === "HEAD") && init.cache !== "no-store";
}

async function fetchWithCorsDetection(
  url: string,
  init: RequestInit,
  host: string,
  origin: string,
): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    // A fetch TypeError is ambiguous: a genuine CORS/network failure and
    // Chrome's ERR_CACHE_OPERATION_NOT_SUPPORTED (it cannot store the 206
    // range responses our tile reads produce) both surface as "Failed to
    // fetch". Retry the idempotent GET once bypassing the browser disk
    // cache — the `response-cache-control` param stays on the URL, so
    // CDN/SW caching is untouched. A cache-op failure now succeeds; a real
    // CORS failure throws again and is reported as such.
    if (isLikelyCorsFailure(error) && isRetriableGet(init)) {
      try {
        return await fetch(url, { ...init, cache: "no-store" });
      } catch (retryError) {
        if (isLikelyCorsFailure(retryError)) {
          throw new CorsLikelyError(host, origin, retryError);
        }
        throw retryError;
      }
    }
    if (isLikelyCorsFailure(error)) {
      throw new CorsLikelyError(host, origin, error);
    }
    throw error;
  }
}

/**
 * Detect expired-token bodies on a cloned response (the caller still owns the
 * unread body). AWS: 400 + `ExpiredToken`; MinIO: 403 + `ExpiredTokenException`.
 */
async function isExpiredTokenResponse(response: Response): Promise<boolean> {
  if (response.status !== 400 && response.status !== 403) return false;
  try {
    const body = await response.clone().text();
    return (
      body.includes("<Code>ExpiredToken</Code>") ||
      body.includes("<Code>ExpiredTokenException</Code>")
    );
  } catch {
    return false;
  }
}

// Tile/chunk bytes are immutable per object version → 7-day cache.
const IMAGE_DATA_CACHE_CONTROL = "private, max-age=604800";

// Sidecars / overlays / JSON companions → 1-hour ceiling so analyst
// regenerations surface without an explicit purge.
const OTHER_DATA_CACHE_CONTROL = "private, max-age=3600";

// Matches TIFF/OME-TIFF reads and OME-Zarr chunk filenames (digits-only).
function isImageDataPath(pathname: string): boolean {
  return /\.tiff?$/i.test(pathname) || /\/\d+(?:\.\d+)*$/.test(pathname);
}

/**
 * S3's SigV4 canonicalization encodes characters that `encodeURIComponent`
 * leaves unreserved per RFC 3986: `! * ' ( )`. The signer runs with
 * `uriEscapePath: false` (paths are pre-encoded to avoid double-encoding),
 * so we must manually encode these characters in the pathname to match
 * what S3 computes server-side. Keeps already-encoded sequences intact.
 */
function encodeS3Path(pathname: string): string {
  return pathname.replace(/[!*'()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/**
 * SigV4-signing fetch. Credentials resolve lazily so the signer is rebuilt
 * when `AccessKeyId` rotates. Every GET injects `response-cache-control` so
 * the browser HTTP cache can serve repeat reads without a network round-trip.
 */
export function createSignedFetch(
  getCredentials: () => Credentials | null,
  /**
   * SigV4 signing region. The region lives on the connection's provider connection
   * in the catalog, not on the connection record; callers that do not carry
   * it resolved fall back to the default. Threading the resolved per-connection
   * region to the browser signer is a follow-up.
   */
  region: string | undefined,
  connectionId?: string,
  credentialMode: "sts" | "presigned" = "sts",
): SignedFetch {
  let cachedKeyId: string | undefined;
  let signer: SignatureV4;

  // Closured so the ExpiredToken retry path can rebuild with refreshed creds.
  const buildSignedRequest = async (url: string, init?: RequestInit) => {
    const credentials = getCredentials();

    if (!credentials?.AccessKeyId || !credentials.SecretAccessKey) {
      throw new Error("Invalid credentials: AccessKeyId and SecretAccessKey are required");
    }

    if (credentials.AccessKeyId !== cachedKeyId) {
      signer = new SignatureV4({
        credentials: {
          accessKeyId: credentials.AccessKeyId,
          secretAccessKey: credentials.SecretAccessKey,
          sessionToken: credentials.SessionToken,
        },
        region: region || "eu-central-1",
        service: "s3",
        sha256: Sha256,
        // S3 paths are pre-encoded; the signer must not double-encode.
        uriEscapePath: false,
      });
      cachedKeyId = credentials.AccessKeyId;
    }

    const parsed = new URL(url);

    const method = (init?.method as string) ?? "GET";
    const isRead = method.toUpperCase() === "GET" || method.toUpperCase() === "HEAD";

    const cacheControl = isImageDataPath(parsed.pathname)
      ? IMAGE_DATA_CACHE_CONTROL
      : OTHER_DATA_CACHE_CONTROL;

    // Signed headers merge LAST so a bypass of `sanitizeHeaders` cannot
    // override the signature.
    const callerHeaders = sanitizeHeaders(init?.headers as Record<string, string> | undefined);

    // Pre-populate the signer's query map so caller-supplied params
    // (e.g. `?versionId=...`) survive — otherwise the wire URL drops them.
    const query: Record<string, string> = Object.fromEntries(parsed.searchParams);
    // `response-cache-control` is a GET/HEAD optimization — skip for PUT/POST.
    if (isRead) {
      query["response-cache-control"] = cacheControl;
    }

    const request = {
      method,
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port ? parseInt(parsed.port) : undefined,
      path: encodeS3Path(parsed.pathname),
      query,
      headers: {
        host: parsed.host,
      },
      // Include the body so the SigV4 signer computes the correct
      // `x-amz-content-sha256` hash — without it, PUT requests would
      // sign an empty body and S3 would reject the signature mismatch.
      ...(init?.body != null ? { body: init.body } : {}),
    };

    const signed = await signer.sign(request);

    // RFC-3986 strict encoding — `URLSearchParams.toString()` form-encodes
    // and would break the signature on reserved characters.
    const wireQuery = Object.entries(query)
      .map(
        ([key, value]) =>
          `${encodeURIComponent(key).replace(/[!*'()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}=${encodeURIComponent(
            value,
          ).replace(/[!*'()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`,
      )
      .join("&");
    const wireUrl = wireQuery
      ? `${parsed.origin}${encodeS3Path(parsed.pathname)}?${wireQuery}`
      : `${parsed.origin}${encodeS3Path(parsed.pathname)}`;

    const browserOrigin =
      typeof window !== "undefined" && typeof window.location?.origin === "string"
        ? window.location.origin
        : "";

    const fetchInit: RequestInit = {
      ...init,
      method: request.method,
      headers: {
        ...callerHeaders,
        ...(signed.headers as Record<string, string>),
      },
      signal: init?.signal,
      // Block redirect-following — `fetch` would otherwise re-send the
      // Authorization header (and the STS token) to whatever host the 30x
      // points at.
      redirect: "error",
    };

    return { wireUrl, fetchInit, host: parsed.host, browserOrigin };
  };

  if (credentialMode === "presigned") {
    return createPresignedFetch(connectionId!);
  }

  return async (url: string, init?: RequestInit): Promise<Response> => {
    const first = await buildSignedRequest(url, init);
    const response = await fetchWithCorsDetection(
      first.wireUrl,
      first.fetchInit,
      first.host,
      first.browserOrigin,
    );

    if (await isExpiredTokenResponse(response)) {
      if (!connectionId) {
        throw new ExpiredCredentialsError(
          "STS credentials expired and no connection name was provided to signedFetch.",
        );
      }
      await requestCredentialsRefresh(connectionId);
      const retried = await buildSignedRequest(url, init);
      const retryResponse = await fetchWithCorsDetection(
        retried.wireUrl,
        retried.fetchInit,
        retried.host,
        retried.browserOrigin,
      );
      if (await isExpiredTokenResponse(retryResponse)) {
        throw new ExpiredCredentialsError(
          "STS credentials expired and refresh did not yield a working session.",
          connectionId,
        );
      }
      return retryResponse;
    }

    return response;
  };
}

// ─── Presigned-URL fetch ──────────────────────────────────────────────

interface PresignCacheEntry {
  presignedUrl: string;
  /** Epoch-ms when the presigned URL stops being valid. */
  expiresAt: number;
}

// One mint per image file, not per tile. A single OME-Zarr image may
// produce hundreds of tile reads; each tile shares one presigned URL
// per method because the URL is the object path, not the range request.
// The cache is per-connection (each `createPresignedFetch` call gets its
// own map) and entries expire when the presigned URL's expiresAt is reached.

async function mintPresignedUrl(
  connectionId: string,
  url: string,
  method: string,
): Promise<PresignCacheEntry> {
  const presignResponse = await fetch("/api/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId, url, method }),
  });

  if (!presignResponse.ok) {
    const error = await presignResponse.json().catch(() => ({}));
    throw new Error(error.error ?? `Presign failed: ${presignResponse.status}`);
  }

  const { presignedUrl, expiresAt } = (await presignResponse.json()) as {
    presignedUrl: string;
    expiresAt: string;
  };

  return {
    presignedUrl,
    expiresAt: new Date(expiresAt).getTime(),
  };
}

async function isPresignedExpiredResponse(response: Response): Promise<boolean> {
  if (response.status !== 403) return false;
  try {
    const body = await response.clone().text();
    return body.includes("Request has expired") || body.includes("<Code>AccessDenied</Code>");
  } catch {
    return false;
  }
}

/**
 * Browser-side fetch for presigned-URL connections. Mints a presigned URL
 * from `/api/presign` once per `(method, url)` pair and caches it in-memory
 * so repeated tile reads for the same object don't re-mint. On a 403
 * "Request has expired", the cache entry is cleared and the URL is
 * re-minted once.
 */
export function createPresignedFetch(connectionId: string): SignedFetch {
  const cache = new Map<string, PresignCacheEntry>();

  const cacheKey = (method: string, url: string) => `${method.toUpperCase()}:${url}`;

  const getOrMint = async (method: string, url: string): Promise<PresignCacheEntry> => {
    const key = cacheKey(method, url);
    const now = Date.now();
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now + 5_000) {
      return cached;
    }
    const entry = await mintPresignedUrl(connectionId, url, method);
    cache.set(key, entry);
    return entry;
  };

  return async (url: string, init?: RequestInit): Promise<Response> => {
    const method = (init?.method as string) ?? "GET";

    const parsed = new URL(url);
    const browserOrigin =
      typeof window !== "undefined" && typeof window.location?.origin === "string"
        ? window.location.origin
        : "";

    const callerHeaders = sanitizeHeaders(init?.headers as Record<string, string> | undefined);

    const fetchInit: RequestInit = {
      ...init,
      method,
      headers: callerHeaders,
      signal: init?.signal,
      redirect: "error",
    };

    let entry = await getOrMint(method, url);
    const response = await fetchWithCorsDetection(
      entry.presignedUrl,
      fetchInit,
      parsed.host,
      browserOrigin,
    );

    if (await isPresignedExpiredResponse(response)) {
      cache.delete(cacheKey(method, url));
      entry = await getOrMint(method, url);
      return fetchWithCorsDetection(
        entry.presignedUrl,
        fetchInit,
        parsed.host,
        browserOrigin,
      );
    }

    return response;
  };
}

/**
 * Unified data-fetch factory. Branches on `credentialMode`:
 * - `sts`       → browser-side SigV4 signing with STS token refresh
 * - `presigned` → server-side presigned URLs via `/api/presign` with caching
 *
 * Callers should use this instead of `createSignedFetch` directly.
 */
export function createDataFetch(
  getCredentials: () => Credentials | null,
  region: string | undefined,
  connectionId: string,
  credentialMode: "sts" | "presigned" = "sts",
): SignedFetch {
  return createSignedFetch(getCredentials, region, connectionId, credentialMode);
}
