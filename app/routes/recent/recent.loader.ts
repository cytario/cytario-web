import { getRecentlyViewed } from "./recent.server";

export type SerializedRecentlyViewed = {
  id: string;
  connectionId: string;
  connectionName: string;
  pathName: string;
  name: string;
  type: string;
  viewedAt: string;
};

/** Load a user's recently viewed items as serialized DTOs, newest-first. */
export async function loadRecentlyViewed(
  userId: string,
  limit = 20,
): Promise<SerializedRecentlyViewed[]> {
  const raw = await getRecentlyViewed(userId, limit);
  return raw.map((item) => ({
    id: item.id,
    connectionId: item.connectionId,
    connectionName: item.connectionName,
    pathName: item.pathName,
    name: item.name,
    type: item.type,
    viewedAt: item.viewedAt.toISOString(),
  }));
}
