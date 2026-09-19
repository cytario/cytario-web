import { PinnedPath } from "~/.generated/client";
import { prisma } from "~/.server/db/prisma";

export type { PinnedPath };

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

export async function removeFavorite(
  userId: string,
  connectionId: string,
  pathName: string,
): Promise<void> {
  await prisma.pinnedPath.deleteMany({ where: { userId, connectionId, pathName } });
}

export async function getFavorites(userId: string): Promise<PinnedPath[]> {
  return prisma.pinnedPath.findMany({
    where: { userId },
    orderBy: { id: "desc" },
  });
}
