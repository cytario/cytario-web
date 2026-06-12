import { type LoaderFunctionArgs } from "react-router";

import { authContext } from "~/.server/auth/authMiddleware";
import { type ServerLoaderData } from "~/routes/connections/connections.loader";
import { loadFavorites, type SerializedFavorite } from "~/routes/favorites/favorites.loader";
import { loadRecentlyViewed, type SerializedRecentlyViewed } from "~/routes/recent/recent.loader";
import { buildConnectionNodes } from "~/utils/dashboardNodes";

export interface HomeServerLoaderData extends ServerLoaderData {
  recentlyViewed: SerializedRecentlyViewed[];
  favorites: SerializedFavorite[];
}

export async function loadHome({ context }: LoaderFunctionArgs): Promise<HomeServerLoaderData> {
  const { connectionConfigs, credentials, user } = context.get(authContext);

  const [recentlyViewed, favorites] = await Promise.all([
    loadRecentlyViewed(user.sub, 20),
    loadFavorites(user.sub),
  ]);

  return {
    nodes: buildConnectionNodes(connectionConfigs),
    credentials,
    connectionConfigs,
    recentlyViewed,
    favorites,
  };
}
