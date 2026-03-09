import { PinnedPath } from "~/.generated/client";
import { prisma } from "~/.server/db/prisma";

export type { PinnedPath };

/** Upsert a pinned path, updating metadata if it already exists. */
export async function addPinnedPath(
  userId: string,
  pin: {
    alias: string;
    pathName: string;
    displayName: string;
    totalSize?: number;
    lastModified?: number;
  },
): Promise<void> {
  await prisma.pinnedPath.upsert({
    where: {
      userId_alias_pathName: {
        userId,
        alias: pin.alias,
        pathName: pin.pathName,
      },
    },
    update: {
      displayName: pin.displayName,
      totalSize: pin.totalSize != null ? BigInt(pin.totalSize) : null,
      lastModified: pin.lastModified != null ? new Date(pin.lastModified) : null,
    },
    create: {
      userId,
      alias: pin.alias,
      pathName: pin.pathName,
      displayName: pin.displayName,
      totalSize: pin.totalSize != null ? BigInt(pin.totalSize) : null,
      lastModified: pin.lastModified != null ? new Date(pin.lastModified) : null,
    },
  });
}

/** Remove a pinned path for a user by alias and path. */
export async function removePinnedPath(
  userId: string,
  alias: string,
  pathName: string,
): Promise<void> {
  await prisma.pinnedPath.deleteMany({ where: { userId, alias, pathName } });
}

/** Get all pinned paths for a user, ordered newest-first. */
export async function getPinnedPaths(userId: string): Promise<PinnedPath[]> {
  return prisma.pinnedPath.findMany({
    where: { userId },
    orderBy: { id: "desc" },
  });
}

/** Check if a specific path is pinned for a user. */
export async function checkIsPinnedPath(
  userId: string,
  alias: string,
  pathName: string,
): Promise<boolean> {
  const count = await prisma.pinnedPath.count({
    where: { userId, alias, pathName },
  });
  return count > 0;
}
