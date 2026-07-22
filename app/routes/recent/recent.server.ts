import { RecentlyViewed } from "~/.generated/client";
import { prisma } from "~/.server/db/prisma";

export type { RecentlyViewed };

/** Upsert a recently viewed item, updating viewedAt if it already exists. */
export async function upsertRecentlyViewed(
  userId: string,
  item: {
    connectionId: number;
    connectionName: string;
    pathName: string;
    name: string;
    type: string;
  },
): Promise<void> {
  await prisma.recentlyViewed.upsert({
    where: {
      userId_connectionId_pathName: {
        userId,
        connectionId: item.connectionId,
        pathName: item.pathName,
      },
    },
    update: { name: item.name, type: item.type, viewedAt: new Date() },
    create: {
      userId,
      connectionId: item.connectionId,
      connectionName: item.connectionName,
      pathName: item.pathName,
      name: item.name,
      type: item.type,
    },
  });
}

/** Get the most recently viewed items for a user, ordered newest-first. */
export async function getRecentlyViewed(userId: string, limit = 20): Promise<RecentlyViewed[]> {
  return prisma.recentlyViewed.findMany({
    where: { userId },
    orderBy: { viewedAt: "desc" },
    take: limit,
  });
}

/** Delete all recently viewed items for a user. */
export async function clearAllRecentlyViewed(userId: string): Promise<void> {
  await prisma.recentlyViewed.deleteMany({ where: { userId } });
}

/** Delete a specific recently viewed item by user, connection id, and path. */
export async function removeRecentlyViewed(
  userId: string,
  connectionId: number,
  pathName: string,
): Promise<void> {
  await prisma.recentlyViewed.deleteMany({ where: { userId, connectionId, pathName } });
}
