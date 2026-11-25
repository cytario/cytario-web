import { Credentials } from "@aws-sdk/client-sts";
import { type LoaderFunctionArgs } from "react-router";

import type { ConnectionConfigWithGrants } from "~/.server/auth/authMiddleware";
import { authContext } from "~/.server/auth/authMiddleware";
import { lockedConnectionIds } from "~/.server/gateResourceFacts.server";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import type { ConnectionStatusUpdate } from "~/utils/connectionsStore/useConnectionsStore";

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
  const {
    user,
    requestOrganization,
    connectionConfigs,
    connectionProviders,
    credentials,
    credentialErrors,
  } = context.get(authContext);

  // Asked once per listed connection — the same question browsing one asks, so
  // a row's locked state cannot disagree with the request that would follow it.
  const locked = await lockedConnectionIds(
    user,
    requestOrganization,
    connectionConfigs.map((config) => ({
      connectionId: config.id,
      isPublic: connectionProviders[config.id]?.isPublic,
    })),
  );

  const payload: ServerLoaderData = {
    nodes: buildConnectionNodes(connectionConfigs, locked),
    credentials,
    credentialErrors,
    connectionConfigs,
  };

  return payload;
}
