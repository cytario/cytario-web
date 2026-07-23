import type { ConnectionConfig } from "~/.generated/client";
import type { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import type { SerializedFavorite } from "~/routes/favorites/favorites.loader";
import type { SerializedRecentlyViewed } from "~/routes/recent/recent.loader";

export function buildVirtualNode(name: string, children: TreeNode[]): TreeNode {
  return {
    id: `aggregate-root/${name}`,
    connectionId: "",
    connectionName: "",
    pathName: "",
    name,
    type: "directory",
    children,
  };
}

export function recentToNode(item: SerializedRecentlyViewed): TreeNode {
  return {
    id: `${item.connectionId}/${item.pathName}`,
    connectionId: item.connectionId,
    connectionName: item.connectionName,
    pathName: item.pathName,
    name: item.name,
    type: item.type as TreeNode["type"],
    children: [],
  };
}

export function favoriteToNode(favorite: SerializedFavorite): TreeNode {
  return {
    id: `${favorite.connectionId}/${favorite.pathName}`,
    connectionId: favorite.connectionId,
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

export function filterByKnownConnection<T extends { connectionId: string }>(
  items: T[],
  configs: ConnectionConfig[],
): T[] {
  const known = new Set(configs.map((c) => c.id));
  return items.filter((item) => known.has(item.connectionId));
}
