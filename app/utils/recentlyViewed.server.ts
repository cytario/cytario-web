import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

import { PrismaClient, RecentlyViewed } from "~/.generated/client";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

export type { RecentlyViewed };

export async function upsertRecentlyViewed(
  userId: string,
  item: {
    provider: string;
    bucketName: string;
    pathName: string;
    name: string;
    type: string;
  },
): Promise<void> {
  await prisma.recentlyViewed.upsert({
    where: {
      userId_provider_bucketName_pathName: {
        userId,
        provider: item.provider,
        bucketName: item.bucketName,
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
  provider: string,
  bucketName: string,
  pathName: string,
): Promise<void> {
  await prisma.recentlyViewed.deleteMany({
    where: { userId, provider, bucketName, pathName },
  });
}
