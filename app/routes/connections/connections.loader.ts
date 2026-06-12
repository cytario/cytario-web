import { Credentials } from "@aws-sdk/client-sts";
import { type LoaderFunctionArgs } from "react-router";

import { ConnectionConfig } from "~/.generated/client";
import { authContext } from "~/.server/auth/authMiddleware";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { getRecentlyViewed } from "~/routes/recent/recent.server";
import type { ConnectionStatusUpdate } from "~/utils/connectionsStore/useConnectionsStore";
import { getPinnedPaths } from "~/utils/pinnedPaths.server";

export type SerializedRecentlyViewed = {
  id: number;
  connectionName: string;
  pathName: string;
  name: string;
  type: string;
  viewedAt: string;
};

export type SerializedPinnedPath = {
  id: number;
  connectionName: string;
  pathName: string;
  displayName: string;
  totalSize: number | null;
  lastModified: string | null;
};

export interface ServerLoaderData {
  nodes: TreeNode[];
  credentials: Record<string, Credentials>;
  connectionConfigs: ConnectionConfig[];
  recentlyViewed: SerializedRecentlyViewed[];
  pinnedPaths: SerializedPinnedPath[];
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
  const { connectionConfigs, credentials, user } = context.get(authContext);
  const userId = user.sub;

  const [recentlyViewedRaw, pinnedPathsRaw] = await Promise.all([
    getRecentlyViewed(userId, 20),
    getPinnedPaths(userId),
  ]);

  const nodes: TreeNode[] = connectionConfigs.map((config) => ({
    id: `${config.name}/`,
    connectionName: config.name,
    name: config.name,
    type: "bucket" as const,
    pathName: "",
    children: [],
    loadState: "idle" as const,
  }));

  const recentlyViewed: SerializedRecentlyViewed[] = recentlyViewedRaw.map((item) => ({
    id: item.id,
    connectionName: item.connectionName,
    pathName: item.pathName,
    name: item.name,
    type: item.type,
    viewedAt: item.viewedAt.toISOString(),
  }));

  const pinnedPaths: SerializedPinnedPath[] = pinnedPathsRaw.map((pin) => ({
    id: pin.id,
    connectionName: pin.connectionName,
    pathName: pin.pathName,
    displayName: pin.displayName,
    totalSize: pin.totalSize != null ? Number(pin.totalSize) : null,
    lastModified: pin.lastModified ? pin.lastModified.toISOString() : null,
  }));

  const payload: ServerLoaderData = {
    nodes,
    credentials,
    connectionConfigs,
    recentlyViewed,
    pinnedPaths,
  };

  return payload;
}
