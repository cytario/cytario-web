import { RecentlyViewed } from "~/.generated/client";
import { prisma } from "~/.server/db/prisma";

export type { RecentlyViewed };

export async function upsertRecentlyViewed(
  userId: string,
  item: {
    alias: string;
    pathName: string;
    name: string;
    type: string;
  },
): Promise<void> {
  await prisma.recentlyViewed.upsert({
    where: {
      userId_alias_pathName: {
        userId,
        alias: item.alias,
        pathName: item.pathName,
      },
    },
    update: { name: item.name, type: item.type, viewedAt: new Date() },
    create: { userId, ...item },
  });
}

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

export async function clearAllRecentlyViewed(userId: string): Promise<void> {
  await prisma.recentlyViewed.deleteMany({ where: { userId } });
}

export async function removeRecentlyViewed(
  userId: string,
  alias: string,
  pathName: string,
): Promise<void> {
  await prisma.recentlyViewed.deleteMany({
    where: { userId, alias, pathName },
  });
}
