import type { Credentials } from "@aws-sdk/client-sts";

import { ConnectionsStore, useConnectionsStore } from "./useConnectionsStore";
import type { ConnectionConfig } from "~/.generated/client";
import { constructS3Url, parseResourceId } from "~/utils/resourceId";

export interface ResolvedResource {
  connectionName: string;
  /** Path relative to the connection root (no prefix). */
  pathName: string;
  connectionConfig: ConnectionConfig;
  credentials: Credentials;
  /** S3 URI: `s3://bucketName/<prefix>/<pathName>`. */
  s3Uri: string;
  /** HTTPS URL for the object (virtual-hosted or path-style per bucket shape). */
  httpsUrl: string;
}

export const select = {
  connection: (connectionName: string) => (state: ConnectionsStore) =>
    state.connections[connectionName],
  connections: (state: ConnectionsStore) => state.connections,
  connectionConfig: (connectionName: string) => (state: ConnectionsStore) =>
    state.connections[connectionName]?.connectionConfig,
  credentials: (connectionName: string) => (state: ConnectionsStore) =>
    state.connections[connectionName]?.credentials,
  setConnection: (state: ConnectionsStore) => state.setConnection,
  reconcileConnections: (state: ConnectionsStore) => state.reconcileConnections,
};

/**
 * Non-reactive resolve for use in async callbacks and utility functions.
 * Reads current state snapshot — does not subscribe to changes.
 *
 * Contrast with reactive selectors (`selectHttpsUrl`): those return `null`
 * when the store doesn't yet hold the connection. This throws — callers
 * that can fire before store hydration should either guard upstream or
 * catch the error.
 *
 * @throws Error if the connection isn't in the store (typically the
 *   initial hydration window).
 *
 * @example
 * const { credentials, connectionConfig, httpsUrl } = resolveResourceId(resourceId);
 * const response = await signedFetch(httpsUrl);
 */
export function resolveResourceId(resourceId: string): ResolvedResource {
  const state = useConnectionsStore.getState();
  const { connectionName } = parseResourceId(resourceId);
  if (!state.connections[connectionName]) {
    throw new Error(`No connection found for: ${connectionName}`);
  }
  const resolved = resolveResource(resourceId, state);
  if (!resolved) {
    throw new Error(`Failed to resolve resourceId: ${resourceId}`);
  }
  return resolved;
}

/**
 * Reactive selector: HTTPS URL for a resourceId, or `null` if the connection
 * isn't in the store yet. Virtual-hosted or path-style per bucket shape.
 *
 * Primitive return — safe to subscribe to directly (stable `Object.is`).
 */
export const selectHttpsUrl =
  (resourceId: string) =>
  (state: ConnectionsStore): string | null =>
    resolveResource(resourceId, state)?.httpsUrl ?? null;

/**
 * Internal: resolves a resourceId against a store snapshot into the full
 * `ResolvedResource` record. **Not safe to use as a reactive selector** — each
 * call returns a fresh object literal.
 *
 * For reactive use, subscribe to `selectHttpsUrl`. For non-reactive use
 * (async callbacks), use `resolveResourceId`.
 */
function resolveResource(
  resourceId: string,
  state: ConnectionsStore,
): ResolvedResource | null {
  const { connectionName, pathName: connectionPathName } =
    parseResourceId(resourceId);

  const connection = state.connections[connectionName];
  if (!connection) return null;

  const { connectionConfig, credentials } = connection;
  const bucketPrefix = connectionConfig.prefix?.replace(/\/$/, "");
  const bucketPathName = bucketPrefix
    ? `${bucketPrefix}/${connectionPathName}`
    : connectionPathName;

  return {
    connectionName,
    connectionConfig,
    pathName: connectionPathName,
    credentials,
    s3Uri: `s3://${connectionConfig.bucketName}/${bucketPathName}`,
    httpsUrl: constructS3Url(connectionConfig, bucketPathName),
  };
}
