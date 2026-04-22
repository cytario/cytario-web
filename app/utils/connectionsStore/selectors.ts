import type { Credentials } from "@aws-sdk/client-sts";

import { ConnectionsStore, useConnectionsStore } from "./useConnectionsStore";
import type { ConnectionConfig } from "~/.generated/client";
import { buildHttpsUrl, parseResourceId } from "~/utils/resourceId";

export interface ResolvedResource {
  connectionName: string;
  /** Path relative to the connection root (no prefix). */
  pathName: string;
  connectionConfig: ConnectionConfig;
  credentials: Credentials;
  /** Full S3 object key (prefix + pathName). */
  s3Key: string;
  /** S3 URI: `s3://bucketName/s3Key`. */
  s3Uri: string;
  /** HTTPS URL for the object (virtual-hosted or path-style per bucket shape). */
  httpsUrl: string;
}

export const select = {
  connections: (state: ConnectionsStore) => state.connections,
  setConnection: (state: ConnectionsStore) => state.setConnection,
  setConnectionIndex: (state: ConnectionsStore) => state.setConnectionIndex,
  clearConnection: (state: ConnectionsStore) => state.clearConnection,
  clearAll: (state: ConnectionsStore) => state.clearAll,
};

export const selectConnection = (key: string) => (state: ConnectionsStore) =>
  state.connections[key] ?? null;

export const selectCredentials = (key: string) => (state: ConnectionsStore) =>
  state.connections[key]?.credentials ?? null;

export const selectConnectionConfig =
  (key: string) => (state: ConnectionsStore) =>
    state.connections[key]?.connectionConfig ?? null;

export const selectConnectionIndex =
  (key: string) => (state: ConnectionsStore) =>
    state.connections[key]?.connectionIndex ?? null;

/**
 * Non-reactive resolve for use in async callbacks and utility functions.
 * Reads current state snapshot — does not subscribe to changes.
 *
 * @throws Error if the connection is not found in the store
 *
 * @example
 * // Inside an async callback / non-reactive utility:
 * const { credentials, connectionConfig, httpsUrl } = resolveResourceId(resourceId);
 * const response = await signedFetch(httpsUrl);
 */
export function resolveResourceId(resourceId: string): ResolvedResource {
  const resolved = resolveResource(resourceId, useConnectionsStore.getState());
  if (!resolved) {
    const { connectionName } = parseResourceId(resourceId);
    throw new Error(`No connection found for: ${connectionName}`);
  }
  return resolved;
}

/**
 * Reactive selector: full S3 object key (prefix + pathName) for a resourceId,
 * or `null` if the connection isn't in the store yet.
 *
 * Primitive return — safe to subscribe to directly (stable `Object.is`).
 *
 * @example
 * const s3Key = useConnectionsStore(selectS3Key(resourceId));
 */
export const selectS3Key =
  (resourceId: string) =>
  (state: ConnectionsStore): string | null =>
    resolveResource(resourceId, state)?.s3Key ?? null;

/**
 * Reactive selector: HTTPS URL for a resourceId, or `null` if the connection
 * isn't in the store yet. Virtual-hosted or path-style per bucket shape.
 *
 * Primitive return — safe to subscribe to directly (stable `Object.is`).
 *
 * @example
 * const httpsUrl = useConnectionsStore(selectHttpsUrl(resourceId));
 * // → "https://bucket.s3.eu-central-1.amazonaws.com/prefix/path/to/file.ome.tif"
 */
export const selectHttpsUrl =
  (resourceId: string) =>
  (state: ConnectionsStore): string | null =>
    resolveResource(resourceId, state)?.httpsUrl ?? null;

/**
 * Reactive selector: `s3://bucket/key` URI for a resourceId, or `null` if the
 * connection isn't in the store yet.
 *
 * Primitive return — safe to subscribe to directly (stable `Object.is`).
 *
 * @example
 * const s3Uri = useConnectionsStore(selectS3Uri(resourceId));
 */
export const selectS3Uri =
  (resourceId: string) =>
  (state: ConnectionsStore): string | null =>
    resolveResource(resourceId, state)?.s3Uri ?? null;

/**
 * Internal: resolves a resourceId against a store snapshot into the full
 * `ResolvedResource` record. **Not safe to use as a reactive selector** — each
 * call returns a fresh object literal, so subscribing via
 * `useConnectionsStore(selectResolvedResource(id))` triggers a re-render on
 * every store tick.
 *
 * For reactive use, subscribe to a primitive via `selectS3Key`, `selectHttpsUrl`,
 * or `selectS3Uri`. For non-reactive use (async callbacks), use `resolveResourceId`.
 */
function resolveResource(
  resourceId: string,
  state: ConnectionsStore,
): ResolvedResource | null {
  const { connectionName, pathName } = parseResourceId(resourceId);
  const conn = state.connections[connectionName];
  if (!conn?.connectionConfig || !conn?.credentials) return null;

  const prefix = conn.connectionConfig.prefix?.replace(/\/$/, "");
  const s3Key = prefix ? `${prefix}/${pathName}` : pathName;

  return {
    connectionName,
    pathName,
    connectionConfig: conn.connectionConfig,
    credentials: conn.credentials,
    s3Key,
    s3Uri: `s3://${conn.connectionConfig.bucketName}/${s3Key}`,
    httpsUrl: buildHttpsUrl(conn.connectionConfig, pathName),
  };
}
