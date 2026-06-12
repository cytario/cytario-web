import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

import type { SerializedFavorite } from "~/routes/favorites/favorites.loader";
import type { SerializedRecentlyViewed } from "~/routes/recent/recent.loader";

/**
 * Recents + favorites for the sidebar sections. Seeded from the protected
 * layout loader so every authenticated surface reads the same list without
 * its own fetch.
 *
 * Only serialized DTOs live here — never DOM nodes, credentials, or other
 * non-serializable values (Redux DevTools serializes the whole store).
 */
export interface DashboardStore {
  recentlyViewed: SerializedRecentlyViewed[];
  favorites: SerializedFavorite[];
  setDashboard: (
    recentlyViewed: SerializedRecentlyViewed[],
    favorites: SerializedFavorite[],
  ) => void;
}

const name = "DashboardStore";

export const useDashboardStore = create<DashboardStore>()(
  devtools(
    immer((set) => ({
      recentlyViewed: [],
      favorites: [],
      setDashboard: (recentlyViewed, favorites) => {
        set(
          (state) => {
            state.recentlyViewed = recentlyViewed;
            state.favorites = favorites;
          },
          false,
          "setDashboard",
        );
      },
    })),
    { name, enabled: process.env.NODE_ENV !== "production" },
  ),
);
