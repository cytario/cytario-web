import type { Credentials } from "@aws-sdk/client-sts";

import { ConnectionsStore, useConnectionsStore } from "./useConnectionsStore";
import type { ConnectionConfig } from "~/.generated/client";
import { parseResourceId } from "~/utils/resourceId";

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
 * @throws Error if the connection is not found in the store
 */
export function resolveResourceId(resourceId: string): ResolvedResource {
  const resolved = selectResolvedResource(resourceId)(useConnectionsStore.getState());
  if (!resolved) {
    const { connectionName } = parseResourceId(resourceId);
    throw new Error(`No connection found for: ${connectionName}`);
  }
  return resolved;
}

/**
 * Zustand selector that resolves a resourceId (`connectionName/pathName`) into
 * the full connection record with S3 key and URI.
 *
 * Use in components for reactivity:
 *   `useConnectionsStore(selectResolvedResource(resourceId))`
 *
 * Use in async callbacks:
 *   `resolveResourceId(resourceId)` (non-reactive wrapper above)
 */
export const selectResolvedResource =
  (resourceId: string) =>
  (state: ConnectionsStore): ResolvedResource | null => {
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
    };
  };
