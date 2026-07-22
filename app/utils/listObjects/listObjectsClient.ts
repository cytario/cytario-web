import { Sha256 } from "@aws-crypto/sha256-browser";
import type { _Object } from "@aws-sdk/client-s3";
import type { Credentials } from "@aws-sdk/client-sts";
import { SignatureV4 } from "@smithy/signature-v4";

import { ExpiredCredentialsError, requestCredentialsRefresh } from "../credentialsRefresh";
import { filterObjects } from "./filterObjects";
import { DEFAULT_MAX_TOTAL } from "../listingLimits";
import { type BucketAddress, constructS3Url } from "../resourceId";
import { CorsLikelyError } from "../signedFetch";

/** A connection's bucket address plus its id (for the credential refresh). */
export type ConnectionAddress = BucketAddress & { id: string };

const DEFAULT_PAGE_SIZE = 1000;

/**
 * RFC 3986 strict percent-encoding — matches the canonical request SigV4
 * builds. `URLSearchParams` form-encoding instead breaks signatures on any
 * continuation token containing `+` (base64).
 */
function rfc3986Encode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!*'()]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * Serialise a query map using the same RFC-3986 encoding the signer applies
 * canonically, so the wire URL byte-matches what was signed.
 */
function encodeWireQuery(query: Record<string, string>): string {
  return Object.entries(query)
    .map(([key, value]) => `${rfc3986Encode(key)}=${rfc3986Encode(value)}`)
    .join("&");
}

export interface ListObjectsClientOptions {
  query?: string | null;
  prefix?: string;
  /** When true, omit Delimiter (recursive flat listing). Default: false (one-level via Delimiter "/"). */
  recursive?: boolean;
  /** S3 page size. Default: 1000 (S3 max). */
  maxKeys?: number;
  /** Hard cap on total entries (contents + commonPrefixes) collected across pages. Default: 10000. */
  maxTotal?: number;
  /**
   * Short-circuits pagination as soon as any object in a fetched page
   * satisfies the predicate. Useful for "first match wins" scans.
   */
  findFirst?: (obj: _Object) => boolean;
  /** Aborts the in-flight pagination loop. */
  signal?: AbortSignal;
}

export interface ListObjectsClientResult {
  contents: _Object[];
  commonPrefixes: string[];
  isCapped: boolean;
}

function getElText(parent: Element, tag: string): string | undefined {
  const el = parent.getElementsByTagName(tag)[0];
  return el?.textContent ?? undefined;
}

function parseListResponse(xml: string): {
  contents: _Object[];
  commonPrefixes: string[];
  isTruncated: boolean;
  nextContinuationToken: string | undefined;
} {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const root = doc.documentElement;
  if (!root) {
    throw new Error("Failed to parse ListBucketResult XML");
  }

  // Firefox injects `<parsererror>` as a child rather than replacing the root,
  // so the nodeName check is insufficient.
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("Failed to parse ListBucketResult XML");
  }

  if (root.nodeName !== "ListBucketResult") {
    const code = doc.getElementsByTagName("Code")[0]?.textContent;
    const message = doc.getElementsByTagName("Message")[0]?.textContent;
    throw new Error(`S3 error: ${code ?? "Unknown"} ${message ?? ""}`.trimEnd());
  }

  const contents: _Object[] = Array.from(root.getElementsByTagName("Contents")).map((node) => {
    const sizeText = getElText(node, "Size");
    const lastModified = getElText(node, "LastModified");
    return {
      Key: getElText(node, "Key") ?? "",
      LastModified: lastModified ? new Date(lastModified) : undefined,
      ETag: getElText(node, "ETag"),
      Size: sizeText !== undefined ? Number(sizeText) : undefined,
      StorageClass: getElText(node, "StorageClass"),
    } as _Object;
  });

  const commonPrefixes: string[] = Array.from(root.getElementsByTagName("CommonPrefixes"))
    .map((node) => getElText(node, "Prefix") ?? "")
    .filter(Boolean);

  return {
    contents,
    commonPrefixes,
    isTruncated: getElText(root, "IsTruncated") === "true",
    nextContinuationToken: getElText(root, "NextContinuationToken"),
  };
}

async function signedListBucketRequest({
  credentials,
  region,
  bucketUrl,
  query,
  signal,
}: {
  credentials: Credentials;
  region: string;
  bucketUrl: string;
  query: Record<string, string>;
  signal?: AbortSignal;
}): Promise<Response> {
  if (!credentials.AccessKeyId || !credentials.SecretAccessKey) {
    throw new Error("Invalid credentials: AccessKeyId and SecretAccessKey are required");
  }

  const signer = new SignatureV4({
    credentials: {
      accessKeyId: credentials.AccessKeyId,
      secretAccessKey: credentials.SecretAccessKey,
      sessionToken: credentials.SessionToken,
    },
    region,
    service: "s3",
    sha256: Sha256,
    // S3 paths are pre-encoded; the signer must not double-encode them.
    uriEscapePath: false,
  });

  const parsed = new URL(bucketUrl);

  const signed = await signer.sign({
    method: "GET",
    protocol: parsed.protocol,
    hostname: parsed.hostname,
    port: parsed.port ? parseInt(parsed.port) : undefined,
    path: parsed.pathname,
    query,
    headers: { host: parsed.host },
  });

  const wireQuery = encodeWireQuery(query);
  const wireUrl = `${parsed.origin}${parsed.pathname}?${wireQuery}`;

  const browserOrigin =
    typeof window !== "undefined" && typeof window.location?.origin === "string"
      ? window.location.origin
      : "";
  try {
    return await fetch(wireUrl, {
      method: "GET",
      headers: signed.headers as Record<string, string>,
      signal,
      // Block redirect-following — `fetch` would otherwise re-send the
      // Authorization header (and the STS token) to whatever host the 30x
      // points at.
      redirect: "error",
    });
  } catch (error) {
    if (isLikelyCorsFailure(error)) {
      throw new CorsLikelyError(parsed.host, browserOrigin, error);
    }
    throw error;
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

/**
 * Detect expired-token bodies on a cloned response so the caller's downstream
 * `.text()` still works. AWS: 400 + `ExpiredToken`; MinIO: 403 + `ExpiredTokenException`.
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

/**
 * Browser-side paginated `ListObjectsV2`. On `ExpiredToken` triggers one
 * refresh through `requestCredentialsRefresh` and retries the page; a second
 * failure surfaces as `ExpiredCredentialsError` for the UI to prompt re-auth.
 */
export async function listObjectsClient(
  connectionConfig: ConnectionAddress,
  credentials: Credentials,
  options: ListObjectsClientOptions = {},
): Promise<ListObjectsClientResult> {
  const {
    query,
    prefix,
    recursive = false,
    maxKeys = DEFAULT_PAGE_SIZE,
    maxTotal = DEFAULT_MAX_TOTAL,
    findFirst,
    signal,
  } = options;

  const bucketUrl = constructS3Url(connectionConfig);
  const region = connectionConfig.region || "eu-central-1";
  const connectionId = connectionConfig.id;

  let activeCredentials: Credentials = credentials;

  const contents: _Object[] = [];
  const commonPrefixes: string[] = [];
  let continuationToken: string | undefined;
  let isCapped = false;
  let pageCount = 0;

  do {
    const queryParams: Record<string, string> = {
      "list-type": "2",
      "max-keys": String(maxKeys),
    };
    if (prefix) queryParams.prefix = prefix;
    if (!recursive) queryParams.delimiter = "/";
    if (continuationToken) queryParams["continuation-token"] = continuationToken;

    let parsed: ReturnType<typeof parseListResponse>;
    try {
      let response = await signedListBucketRequest({
        credentials: activeCredentials,
        region,
        bucketUrl,
        query: queryParams,
        signal,
      });

      if (await isExpiredTokenResponse(response)) {
        if (!connectionId) {
          throw new ExpiredCredentialsError(
            "STS credentials expired and no connection id was provided to listObjectsClient.",
          );
        }
        activeCredentials = await requestCredentialsRefresh(connectionId);
        response = await signedListBucketRequest({
          credentials: activeCredentials,
          region,
          bucketUrl,
          query: queryParams,
          signal,
        });
        if (await isExpiredTokenResponse(response)) {
          throw new ExpiredCredentialsError(
            "STS credentials expired and refresh did not yield a working session.",
            connectionId,
          );
        }
      }

      if (!response.ok) {
        throw new Error(`ListObjectsV2 failed: ${response.status} ${response.statusText}`);
      }

      // Body read + parse inside the guard so a mid-pagination failure
      // returns a capped partial result instead of dropping prior pages.
      const xml = await response.text();
      parsed = parseListResponse(xml);
    } catch (error) {
      // ExpiredCredentialsError must escape so the UI can prompt re-auth.
      if (error instanceof ExpiredCredentialsError) throw error;
      if (pageCount === 0) throw error;
      isCapped = true;
      break;
    }

    pageCount++;

    for (const obj of parsed.contents) contents.push(obj);
    for (const cp of parsed.commonPrefixes) commonPrefixes.push(cp);

    if (findFirst && contents.some(findFirst)) break;

    if (contents.length + commonPrefixes.length >= maxTotal) {
      isCapped = parsed.isTruncated;
      break;
    }

    continuationToken = parsed.isTruncated ? parsed.nextContinuationToken : undefined;
  } while (continuationToken);

  return {
    contents: filterObjects(contents, { query }),
    commonPrefixes,
    isCapped,
  };
}
