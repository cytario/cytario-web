import { getFavorites } from "./favorites.server";

export type SerializedFavorite = {
  id: number;
  connectionName: string;
  pathName: string;
  displayName: string;
  totalSize: number | null;
  lastModified: string | null;
};

/** Load a user's favorites as serialized DTOs, newest-first. */
export async function loadFavorites(userId: string): Promise<SerializedFavorite[]> {
  const raw = await getFavorites(userId);
  return raw.map((favorite) => ({
    id: favorite.id,
    connectionName: favorite.connectionName,
    pathName: favorite.pathName,
    displayName: favorite.displayName,
    totalSize: favorite.totalSize != null ? Number(favorite.totalSize) : null,
    lastModified: favorite.lastModified ? favorite.lastModified.toISOString() : null,
  }));
}
