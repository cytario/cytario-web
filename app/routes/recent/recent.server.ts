import { RecentlyViewed } from "~/.generated/client";
import { prisma } from "~/.server/db/prisma";

export type { RecentlyViewed };

export async function upsertRecentlyViewed(
  userId: string,
  item: {
    connectionId: string;
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

export async function getRecentlyViewed(userId: string, limit = 20): Promise<RecentlyViewed[]> {
  return prisma.recentlyViewed.findMany({
    where: { userId },
    orderBy: { viewedAt: "desc" },
    take: limit,
  });
}

export async function clearAllRecentlyViewed(userId: string): Promise<void> {
  await prisma.recentlyViewed.deleteMany({ where: { userId } });
}

export async function removeRecentlyViewed(
  userId: string,
  connectionId: string,
  pathName: string,
): Promise<void> {
  await prisma.recentlyViewed.deleteMany({ where: { userId, connectionId, pathName } });
}
