import { useEffect } from "react";

import type { SerializedFavorite } from "~/routes/favorites/favorites.loader";
import type { SerializedRecentlyViewed } from "~/routes/recent/recent.loader";
import { useDashboardStore } from "~/utils/dashboardStore/useDashboardStore";

/**
 * Seed the dashboard store with the layout's recents/favorites. Effect rather
 * than render-time mutation: subscribed sidebar descendants would otherwise
 * trip React's "cannot update during render" warning.
 */
export function useInitDashboard(
  recentlyViewed: SerializedRecentlyViewed[],
  favorites: SerializedFavorite[],
) {
  const setDashboard = useDashboardStore((s) => s.setDashboard);

  useEffect(() => {
    setDashboard(recentlyViewed, favorites);
  }, [recentlyViewed, favorites, setDashboard]);
}
