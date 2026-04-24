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
  connectionConfig: (connectionName: string) => (state: ConnectionsStore) =>
    state.connectionConfigs[connectionName],
  connectionConfigs: (state: ConnectionsStore) => state.connectionConfigs,
  credentials: (connectionName: string) => (state: ConnectionsStore) => {
    const config = state.connectionConfigs[connectionName];
    if (!config) return undefined;
    return state.bucketCredentials[config.bucketName];
  },
  setConnection: (state: ConnectionsStore) => state.setConnection,
};

/**
 * Joined view: config + credentials for a connection, or `null` if either
 * side is missing from the store.
 *
 * **Not primitive** — returns a fresh object literal on every call. Avoid
 * subscribing to this directly in a component; use `select.connectionConfig`
 * + `select.credentials` separately (credentials refresh shouldn't re-render
 * UI).
 */
export const selectConnection =
  (connectionName: string) => (state: ConnectionsStore) => {
    const connectionConfig = state.connectionConfigs[connectionName];
    if (!connectionConfig) return null;
    const credentials = state.bucketCredentials[connectionConfig.bucketName];
    if (!credentials) return null;
    return { connectionConfig, credentials };
  };

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

  const connectionConfig = state.connectionConfigs[connectionName];
  if (!connectionConfig) return null;

  const bucketCredentials =
    state.bucketCredentials[connectionConfig.bucketName];
  if (!bucketCredentials) return null;

  const bucketPrefix = connectionConfig.prefix?.replace(/\/$/, "");

  const bucketPathName = bucketPrefix
    ? `${bucketPrefix}/${connectionPathName}`
    : connectionPathName;

  return {
    connectionName,
    connectionConfig,
    pathName: connectionPathName,
    credentials: bucketCredentials,
    s3Uri: `s3://${connectionConfig.bucketName}/${bucketPathName}`,
    httpsUrl: constructS3Url(connectionConfig, bucketPathName),
  };
}
