import { PinnedPath } from "~/.generated/client";
import { prisma } from "~/.server/db/prisma";

export type { PinnedPath };

export async function addPinnedPath(
  userId: string,
  pin: {
    provider: string;
    bucketName: string;
    pathName: string;
    displayName: string;
    totalSize?: number;
    lastModified?: number;
  },
): Promise<void> {
  await prisma.pinnedPath.upsert({
    where: {
      userId_provider_bucketName_pathName: {
        userId,
        provider: pin.provider,
        bucketName: pin.bucketName,
        pathName: pin.pathName,
      },
    },
    update: {
      displayName: pin.displayName,
      totalSize: pin.totalSize != null ? BigInt(pin.totalSize) : null,
      lastModified:
        pin.lastModified != null ? new Date(pin.lastModified) : null,
    },
    create: {
      userId,
      provider: pin.provider,
      bucketName: pin.bucketName,
      pathName: pin.pathName,
      displayName: pin.displayName,
      totalSize: pin.totalSize != null ? BigInt(pin.totalSize) : null,
      lastModified:
        pin.lastModified != null ? new Date(pin.lastModified) : null,
    },
  });
}

export async function removePinnedPath(
  userId: string,
  provider: string,
  bucketName: string,
  pathName: string,
): Promise<void> {
  await prisma.pinnedPath.deleteMany({
    where: { userId, provider, bucketName, pathName },
  });
}

export async function getPinnedPaths(userId: string): Promise<PinnedPath[]> {
  return prisma.pinnedPath.findMany({
    where: { userId },
    orderBy: { id: "desc" },
  });
}

export async function checkIsPinnedPath(
  userId: string,
  provider: string,
  bucketName: string,
  pathName: string,
): Promise<boolean> {
  const count = await prisma.pinnedPath.count({
    where: { userId, provider, bucketName, pathName },
  });
  return count > 0;
}
