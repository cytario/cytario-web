import { z } from "zod";

/**
 * Reject NUL / CR / LF (illegal in S3 keys, common smuggling chars) and
 * oversized inputs. `..` traversal is checked by `resolveConnectionPrefix`.
 */
export const prefixSchema = z
  .string()
  .max(1024, "Prefix exceeds 1024 characters")
  .regex(/^[^\0\r\n]*$/, "Prefix contains illegal control characters");

export function getPrefix(path?: string) {
  if (!path) return undefined;
  if (path.endsWith("/")) return path;
  return path + "/";
}

export function getName(path?: string, bucketName?: string): string {
  if (!path) return bucketName ?? "";
  return path.split("/").pop() ?? "";
}

/** Thrown when a caller-supplied prefix escapes the connection's `prefix` boundary. */
export class ConnectionPrefixError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectionPrefixError";
  }
}

export interface ResolvedConnectionPrefix {
  /** Normalized path relative to the connection root (no leading/trailing slash). */
  urlPath: string;
  /** Full S3 key path: `${connPrefix}/${urlPath}` with redundant slashes squashed. */
  pathName: string;
  /** S3 listing prefix — `pathName` with a trailing slash, or `undefined` for bucket root. */
  prefix: string | undefined;
}

/**
 * Compose the S3 listing prefix, asserting `rawUrlPath` stays under
 * `connPrefix`. Defense in depth above STS / bucket policy. Throws
 * `ConnectionPrefixError` on `..` segments or out-of-prefix paths.
 */
export function resolveConnectionPrefix(
  connPrefix: string | null | undefined,
  rawUrlPath: string,
): ResolvedConnectionPrefix {
  const segments = rawUrlPath.split("/");
  for (const seg of segments) {
    if (seg === "..") {
      throw new ConnectionPrefixError("Path traversal '..' is not allowed in prefix");
    }
  }

  const urlPath = segments.filter((s) => s !== "" && s !== ".").join("/");

  const normalizedConnPrefix = (connPrefix ?? "").replace(/^\/+|\/+$/g, "");

  const pathName = normalizedConnPrefix
    ? urlPath
      ? `${normalizedConnPrefix}/${urlPath}`
      : normalizedConnPrefix
    : urlPath;

  if (normalizedConnPrefix && !pathName.startsWith(normalizedConnPrefix)) {
    throw new ConnectionPrefixError("Resolved path escapes connection prefix");
  }

  return {
    urlPath,
    pathName,
    prefix: getPrefix(pathName),
  };
}
