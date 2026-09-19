import { getFavorites } from "./favorites.server";

export type SerializedFavorite = {
  id: string;
  connectionId: string;
  connectionName: string;
  pathName: string;
  displayName: string;
  totalSize: number | null;
  lastModified: string | null;
};

export async function loadFavorites(userId: string): Promise<SerializedFavorite[]> {
  const raw = await getFavorites(userId);
  return raw.map((favorite) => ({
    id: favorite.id,
    connectionId: favorite.connectionId,
    connectionName: favorite.connectionName,
    pathName: favorite.pathName,
    displayName: favorite.displayName,
    totalSize: favorite.totalSize != null ? Number(favorite.totalSize) : null,
    lastModified: favorite.lastModified ? favorite.lastModified.toISOString() : null,
  }));
}
