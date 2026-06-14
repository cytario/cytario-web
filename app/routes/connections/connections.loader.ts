import { Credentials } from "@aws-sdk/client-sts";
import { type LoaderFunctionArgs } from "react-router";

import { ConnectionConfig } from "~/.generated/client";
import { authContext } from "~/.server/auth/authMiddleware";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import type { ConnectionStatusUpdate } from "~/utils/connectionsStore/useConnectionsStore";
import { buildConnectionNodes } from "~/utils/dashboardNodes";

export interface ServerLoaderData {
  nodes: TreeNode[];
  credentials: Record<string, Credentials>;
  connectionConfigs: ConnectionConfig[];
}

export interface LoaderData extends ServerLoaderData {
  /** Same shape as `nodes` but with per-bucket preview enrichment from the client probe. */
  nodes: TreeNode[];
  /**
   * Per-connection health from the client probe, fed into the connections store.
   * Absent when a non-revalidating navigation renders with server-loader data.
   */
  connectionStatuses?: Record<string, ConnectionStatusUpdate>;
}

export async function loadConnections({ context }: LoaderFunctionArgs) {
  const { connectionConfigs, credentials } = context.get(authContext);

  const payload: ServerLoaderData = {
    nodes: buildConnectionNodes(connectionConfigs),
    credentials,
    connectionConfigs,
  };

  return payload;
}
