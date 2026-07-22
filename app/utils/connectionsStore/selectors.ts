import type { Credentials } from "@aws-sdk/client-sts";

import { ConnectionsStore, useConnectionsStore } from "./useConnectionsStore";
import type { ConnectionConfigWithGrants } from "./useConnectionsStore";
import { constructS3Url, parseResourceId } from "~/utils/resourceId";

export interface ResolvedResource {
  connectionId: string;
  /** Path relative to the connection root (no prefix). */
  pathName: string;
  connectionConfig: ConnectionConfigWithGrants;
  credentials: Credentials;
  /** Resolved SigV4 signing region, or `undefined` when the catalog ref is stale. */
  region: string | undefined;
  /** Resolved S3-compatible endpoint, or `null`/`undefined` for native AWS S3. */
  endpoint: string | null | undefined;
  /** S3 URI: `s3://bucketName/<prefix>/<pathName>`. */
  s3Uri: string;
  /** HTTPS URL for the object (virtual-hosted or path-style per bucket shape). */
  httpsUrl: string;
}

/**
 * Live, non-reactive credentials getter — the contract `createSignedFetch`
 * needs for its lazy resolve: a fresh store read per call (never a captured
 * snapshot), so retries after an STS rotation pick up the new credentials.
 */
export const liveCredentials = (connectionId: string) => (): Credentials | null =>
  useConnectionsStore.getState().connections[connectionId]?.credentials ?? null;

export const select = {
  connection: (connectionId: string) => (state: ConnectionsStore) =>
    state.connections[connectionId],
  connections: (state: ConnectionsStore) => state.connections,
  connectionConfig: (connectionId: string) => (state: ConnectionsStore) =>
    state.connections[connectionId]?.connectionConfig,
  credentials: (connectionId: string) => (state: ConnectionsStore) =>
    state.connections[connectionId]?.credentials,
  connectionStatus: (connectionId: string) => (state: ConnectionsStore) =>
    state.connections[connectionId]?.status ?? "loading",
  connectionStatusMessage: (connectionId: string) => (state: ConnectionsStore) =>
    state.connections[connectionId]?.statusMessage,
  setConnections: (state: ConnectionsStore) => state.setConnections,
};

export function resolveResourceId(resourceId: string): ResolvedResource {
  const state = useConnectionsStore.getState();
  const { connectionId } = parseResourceId(resourceId);
  if (!state.connections[connectionId]) {
    throw new Error(`No connection found for: ${connectionId}`);
  }
  const resolved = resolveResource(resourceId, state);
  if (!resolved) {
    throw new Error(`Failed to resolve resourceId: ${resourceId}`);
  }
  return resolved;
}

export const selectHttpsUrl =
  (resourceId: string) =>
  (state: ConnectionsStore): string | null =>
    resolveResource(resourceId, state)?.httpsUrl ?? null;

function resolveResource(resourceId: string, state: ConnectionsStore): ResolvedResource | null {
  const { connectionId, pathName: connectionPathName } = parseResourceId(resourceId);

  const connection = state.connections[connectionId];
  if (!connection) return null;

  const { connectionConfig, credentials, provider } = connection;
  if (!credentials) return null;
  const bucketPrefix = connectionConfig.prefix?.replace(/\/$/, "");
  const bucketPathName = bucketPrefix
    ? `${bucketPrefix}/${connectionPathName}`
    : connectionPathName;

  return {
    connectionId,
    connectionConfig,
    pathName: connectionPathName,
    credentials,
    region: provider?.region,
    endpoint: provider?.endpoint,
    s3Uri: `s3://${connectionConfig.bucketName}/${bucketPathName}`,
    httpsUrl: constructS3Url(
      {
        bucketName: connectionConfig.bucketName,
        region: provider?.region,
        endpoint: provider?.endpoint,
      },
      bucketPathName,
    ),
  };
}
