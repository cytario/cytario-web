import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useFetcher } from "react-router";

import { type SerializedFavorite } from "./favorites.loader";
import {
  type TreeNode,
  computeDirectoryLastModified,
  computeDirectorySize,
} from "~/components/DirectoryView/buildDirectoryTree";

const FAVORITES_ACTION = "/favorites";

function favoriteKey(pathName: string): string {
  return (pathName ?? "").replace(/\/$/, "");
}

function nodeKey(connectionId: string, pathName: string): string {
  return `${connectionId}/${favoriteKey(pathName)}`;
}

interface FavoritesController {
  isFavorite: (node: TreeNode) => boolean;
  isPending: (node: TreeNode) => boolean;
  toggle: (node: TreeNode) => void;
}

const FavoritesContext = createContext<FavoritesController | null>(null);

export function FavoritesProvider({
  favorites,
  children,
}: {
  favorites: SerializedFavorite[];
  children: ReactNode;
}) {
  const fetcher = useFetcher();
  const { submit } = fetcher;

  const favSet = useMemo(
    () => new Set(favorites.map((f) => nodeKey(f.connectionId, f.pathName))),
    [favorites],
  );

  const pendingKey =
    fetcher.state !== "idle" && fetcher.formData
      ? nodeKey(
          String(fetcher.formData.get("connectionId") ?? ""),
          String(fetcher.formData.get("pathName") ?? ""),
        )
      : null;
  const pendingAdding = fetcher.formMethod?.toLowerCase() === "put";

  const controller = useMemo<FavoritesController>(() => {
    const isFavorite = (node: TreeNode) => {
      const key = nodeKey(node.connectionId ?? node.connectionName, node.pathName);
      if (pendingKey === key) return pendingAdding;
      return favSet.has(key);
    };

    const isPending = (node: TreeNode) =>
      pendingKey === nodeKey(node.connectionId ?? node.connectionName, node.pathName);

    const toggle = (node: TreeNode) => {
      const key = favoriteKey(node.pathName);
      if (isFavorite(node)) {
        submit(
          { connectionId: node.connectionId ?? node.connectionName, pathName: key },
          { method: "delete", action: FAVORITES_ACTION },
        );
        return;
      }

      const payload: Record<string, string> = {
        connectionId: node.connectionId ?? node.connectionName,
        pathName: key,
        displayName: node.name,
      };

      let totalSize = 0;
      let lastModified = 0;
      if (node.type === "file") {
        totalSize = node._Object?.Size ?? 0;
        lastModified = node._Object?.LastModified
          ? new Date(node._Object.LastModified).getTime()
          : 0;
      } else if (node.children && node.children.length > 0) {
        totalSize = computeDirectorySize(node);
        lastModified = computeDirectoryLastModified(node);
      }
      if (totalSize) payload.totalSize = String(totalSize);
      if (lastModified) payload.lastModified = String(lastModified);

      submit(payload, { method: "put", action: FAVORITES_ACTION });
    };

    return { isFavorite, isPending, toggle };
  }, [favSet, pendingKey, pendingAdding, submit]);

  return <FavoritesContext.Provider value={controller}>{children}</FavoritesContext.Provider>;
}

export interface UseFavorite {
  isFavorite: boolean;
  isPending: boolean;
  toggle: () => void;
}

export function useFavorite(node: TreeNode): UseFavorite {
  const controller = useContext(FavoritesContext);
  if (!controller) {
    throw new Error("useFavorite must be used within a FavoritesProvider");
  }
  return {
    isFavorite: controller.isFavorite(node),
    isPending: controller.isPending(node),
    toggle: () => controller.toggle(node),
  };
}
