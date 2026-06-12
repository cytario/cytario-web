import { type ClientLoaderFunctionArgs } from "react-router";

import { type HomeServerLoaderData } from "./home.loader";
import { enrichConnectionsWithPreviews } from "~/routes/connections/connections.clientLoader";
import { type LoaderData } from "~/routes/connections/connections.loader";

export interface HomeLoaderData extends LoaderData {
  recentlyViewed: HomeServerLoaderData["recentlyViewed"];
  favorites: HomeServerLoaderData["favorites"];
}

/**
 * Same per-connection preview probe as the connections list, but the home
 * server loader also carries recents/favorites — the shared enricher spreads
 * the full server payload, so those pass through to the client unchanged.
 */
export async function enrichHomeWithPreviews(
  args: ClientLoaderFunctionArgs,
): Promise<HomeLoaderData> {
  return enrichConnectionsWithPreviews(args) as Promise<HomeLoaderData>;
}

enrichHomeWithPreviews.hydrate = true;
