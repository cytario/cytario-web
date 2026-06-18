import { EmptyState, IconButtonLink } from "@cytario/design";
import { ArrowRight, Star } from "lucide-react";
import { useMemo } from "react";
import { useRouteLoaderData } from "react-router";

import { SidebarNodeList } from "./SidebarNodeList";
import { FeatureItem } from "~/components/FeatureItem/FeatureItem";
import type { loader as protectedLayoutLoader } from "~/routes/layouts/protected.layout";
import { select } from "~/utils/connectionsStore/selectors";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { favoriteToNode } from "~/utils/treeNodeFactories";

const MAX_SIDEBAR_ITEMS = 8;

export function FeatureItemFavorites() {
  const connections = useConnectionsStore(select.connections);
  const layoutData = useRouteLoaderData<typeof protectedLayoutLoader>(
    "routes/layouts/protected.layout",
  );

  const nodes = useMemo(
    () =>
      (layoutData?.favorites ?? [])
        .filter((favorite) => connections[favorite.connectionName])
        .slice(0, MAX_SIDEBAR_ITEMS)
        .map(favoriteToNode),
    [layoutData, connections],
  );

  return (
    <FeatureItem
      title="Favorites"
      badge={String(nodes.length)}
      actions={
        <IconButtonLink
          href="/favorites"
          icon={ArrowRight}
          aria-label="View all favorites"
          variant="ghost"
          size="sm"
        />
      }
    >
      {nodes.length > 0 ? (
        <SidebarNodeList nodes={nodes} />
      ) : (
        <EmptyState icon={Star} title="No favorites" description="No favorites yet." />
      )}
    </FeatureItem>
  );
}
