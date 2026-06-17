import type { ConnectionConfig } from "~/.generated/client";
import type { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import type { SerializedFavorite } from "~/routes/favorites/favorites.loader";
import type { SerializedRecentlyViewed } from "~/routes/recent/recent.loader";

/**
 * A synthetic root over a flat list of nodes (connections, favorites, recents).
 * Carries no `connectionName`, so its header `NodeContextMenu` has no per-node
 * actions and renders nothing — these pages favorite per-row, not per-page.
 */
export function buildVirtualNode(name: string, children: TreeNode[]): TreeNode {
  return {
    id: `aggregate-root/${name}`,
    connectionName: "",
    pathName: "",
    name,
    type: "directory",
    children,
  };
}

/** A recently viewed item as a navigable tree node. */
export function recentToNode(item: SerializedRecentlyViewed): TreeNode {
  return {
    id: `${item.connectionName}/${item.pathName}`,
    connectionName: item.connectionName,
    pathName: item.pathName,
    name: item.name,
    type: item.type as TreeNode["type"],
    children: [],
  };
}

/** A favorite as a navigable directory tree node, carrying any cached metadata. */
export function favoriteToNode(favorite: SerializedFavorite): TreeNode {
  return {
    id: `${favorite.connectionName}/${favorite.pathName}`,
    connectionName: favorite.connectionName,
    pathName: favorite.pathName,
    name: favorite.displayName,
    type: "directory" as const,
    children: [],
    _Object:
      favorite.totalSize != null || favorite.lastModified != null
        ? ({
            Size: favorite.totalSize ?? undefined,
            LastModified: favorite.lastModified ? new Date(favorite.lastModified) : undefined,
          } as TreeNode["_Object"])
        : undefined,
  };
}

/** Keep only items whose connection is still visible to the user. */
export function filterByKnownConnection<T extends { connectionName: string }>(
  items: T[],
  configs: ConnectionConfig[],
): T[] {
  const known = new Set(configs.map((c) => c.name));
  return items.filter((item) => known.has(item.connectionName));
}
