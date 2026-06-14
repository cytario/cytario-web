import { PinnedPath } from "~/.generated/client";
import { prisma } from "~/.server/db/prisma";

export type { PinnedPath };

/** Upsert a favorite, updating metadata if it already exists. */
export async function addFavorite(
  userId: string,
  favorite: {
    connectionName: string;
    pathName: string;
    displayName: string;
    totalSize?: number;
    lastModified?: number;
  },
): Promise<void> {
  await prisma.pinnedPath.upsert({
    where: {
      userId_connectionName_pathName: {
        userId,
        connectionName: favorite.connectionName,
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
      connectionName: favorite.connectionName,
      pathName: favorite.pathName,
      displayName: favorite.displayName,
      totalSize: favorite.totalSize != null ? BigInt(favorite.totalSize) : null,
      lastModified: favorite.lastModified != null ? new Date(favorite.lastModified) : null,
    },
  });
}

/** Remove a favorite for a user by connection name and path. */
export async function removeFavorite(
  userId: string,
  connectionName: string,
  pathName: string,
): Promise<void> {
  await prisma.pinnedPath.deleteMany({ where: { userId, connectionName, pathName } });
}

/** Get all favorites for a user, ordered newest-first. */
export async function getFavorites(userId: string): Promise<PinnedPath[]> {
  return prisma.pinnedPath.findMany({
    where: { userId },
    orderBy: { id: "desc" },
  });
}

/** Check if a specific path is favorited for a user. */
export async function checkIsFavorite(
  userId: string,
  connectionName: string,
  pathName: string,
): Promise<boolean> {
  const count = await prisma.pinnedPath.count({
    where: { userId, connectionName, pathName },
  });
  return count > 0;
}
