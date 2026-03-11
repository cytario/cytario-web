import { RecentlyViewed } from "~/.generated/client";
import { prisma } from "~/.server/db/prisma";

export type { RecentlyViewed };

/** Upsert a recently viewed item, updating viewedAt if it already exists. */
export async function upsertRecentlyViewed(
  userId: string,
  item: { alias: string; pathName: string; name: string; type: string },
): Promise<void> {
  await prisma.recentlyViewed.upsert({
    where: {
      userId_connectionName_pathName: {
        userId,
        connectionName: item.alias,
        pathName: item.pathName,
      },
    },
    update: { name: item.name, type: item.type, viewedAt: new Date() },
    create: {
      userId,
      connectionName: item.alias,
      pathName: item.pathName,
      name: item.name,
      type: item.type,
    },
  });
}

/** Get the most recently viewed items for a user, ordered newest-first. */
export async function getRecentlyViewed(
  userId: string,
  limit = 20,
): Promise<RecentlyViewed[]> {
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

/** Delete a specific recently viewed item by user, connection name, and path. */
export async function removeRecentlyViewed(
  userId: string,
  connectionName: string,
  pathName: string,
): Promise<void> {
  await prisma.recentlyViewed.deleteMany({ where: { userId, connectionName, pathName } });
}
