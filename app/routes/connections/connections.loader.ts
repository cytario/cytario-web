import { Credentials } from "@aws-sdk/client-sts";
import { type LoaderFunctionArgs } from "react-router";

import type { ConnectionConfigWithGrants } from "~/.server/auth/authMiddleware";
import { authContext } from "~/.server/auth/authMiddleware";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import type { ConnectionStatusUpdate } from "~/utils/connectionsStore/useConnectionsStore";
import type { LockedConnection } from "~/utils/lockedConnection";

function buildConnectionNodes(
  configs: ConnectionConfigWithGrants[],
  lockedConnectionIds: readonly string[],
): TreeNode[] {
  return configs.map((config) => ({
    id: `${config.id}/`,
    connectionId: config.id,
    connectionName: config.name,
    name: config.name,
    type: "bucket" as const,
    pathName: "",
    children: [],
    loadState: "idle" as const,
    ...(lockedConnectionIds.includes(config.id) ? { isLocked: true as const } : {}),
  }));
}

export interface ServerLoaderData {
  nodes: TreeNode[];
  credentials: Record<string, Credentials>;
  /** Per-connection mint failures; a credential-less connection absent here is public, not broken. */
  credentialErrors: Record<string, string>;
  connectionConfigs: ConnectionConfigWithGrants[];
  /** The gate's lock verdicts, with the call to action each row renders. */
  lockedConnections: LockedConnection[];
}

export interface LoaderData extends ServerLoaderData {
  /** Same shape as `nodes` but with per-bucket preview enrichment from the client probe. */
  nodes: TreeNode[];
  /**
   * Per-connection health from the client probe, fed into the connections
   * store. Absent when a non-revalidating navigation renders with
   * server-loader data.
   */
  connectionStatuses?: Record<string, ConnectionStatusUpdate>;
}

export async function loadConnections({ context }: LoaderFunctionArgs) {
  const { connectionConfigs, credentials, credentialErrors, lockedConnections } =
    context.get(authContext);

  // A locked connection is listed but never handed a credential: the request
  // probe already refused to mint one, and this payload is what the browser gets.
  const lockedConnectionIds = lockedConnections.map((locked) => locked.id);
  const lockedIds = new Set(lockedConnectionIds);
  const browsableCredentials = Object.fromEntries(
    Object.entries(credentials).filter(([connectionId]) => !lockedIds.has(connectionId)),
  );

  const payload: ServerLoaderData = {
    nodes: buildConnectionNodes(connectionConfigs, lockedConnectionIds),
    credentials: browsableCredentials,
    credentialErrors,
    connectionConfigs,
    lockedConnections,
  };

  return payload;
}
