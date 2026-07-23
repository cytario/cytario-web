import { PinnedPath } from "~/.generated/client";
import { prisma } from "~/.server/db/prisma";

export type { PinnedPath };

/** Upsert a favorite, updating metadata if it already exists. */
export async function addFavorite(
  userId: string,
  favorite: {
    connectionId: string;
    connectionName: string;
    pathName: string;
    displayName: string;
    totalSize?: number;
    lastModified?: number;
  },
): Promise<void> {
  await prisma.pinnedPath.upsert({
    where: {
      userId_connectionId_pathName: {
        userId,
        connectionId: favorite.connectionId,
        pathName: favorite.pathName,
      },
    },
    update: {
      displayName: favorite.displayName,
      totalSize: favorite.totalSize != null ? BigInt(favorite.totalSize) : null,
      lastModified: favorite.lastModified != null ? new Date(favorite.lastModified) : null,
    },
    create: {
      userId,
      connectionId: favorite.connectionId,
      connectionName: favorite.connectionName,
      pathName: favorite.pathName,
      displayName: favorite.displayName,
      totalSize: favorite.totalSize != null ? BigInt(favorite.totalSize) : null,
      lastModified: favorite.lastModified != null ? new Date(favorite.lastModified) : null,
    },
  });
}

/** Remove a favorite for a user by connection id and path. */
export async function removeFavorite(
  userId: string,
  connectionId: string,
  pathName: string,
): Promise<void> {
  await prisma.pinnedPath.deleteMany({ where: { userId, connectionId, pathName } });
}

/** Get all favorites for a user, ordered newest-first. */
export async function getFavorites(userId: string): Promise<PinnedPath[]> {
  return prisma.pinnedPath.findMany({
    where: { userId },
    orderBy: { id: "desc" },
  });
}
