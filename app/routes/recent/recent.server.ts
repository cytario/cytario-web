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

/**
 * The user's recently-viewed entries in `organization` only — the take/window
 * applies per org, so a busy week in one tenant cannot evict another's.
 */
export async function getRecentlyViewed(
  userId: string,
  organization: string,
  limit = 20,
): Promise<RecentlyViewed[]> {
  return prisma.recentlyViewed.findMany({
    where: { userId, connection: { organization } },
    orderBy: { viewedAt: "desc" },
    take: limit,
  });
}

/** Clears the user's recently-viewed entries in `organization` only. */
export async function clearAllRecentlyViewed(userId: string, organization: string): Promise<void> {
  await prisma.recentlyViewed.deleteMany({
    where: { userId, connection: { organization } },
  });
}

export async function removeRecentlyViewed(
  userId: string,
  connectionId: string,
  pathName: string,
): Promise<void> {
  await prisma.recentlyViewed.deleteMany({ where: { userId, connectionId, pathName } });
}
