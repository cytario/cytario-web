import { EmptyState, IconButtonLink } from "@cytario/design";
import { useMemo } from "react";
import { useRouteLoaderData } from "react-router";

import { SidebarNodeList } from "../SidebarNodeList";
import { Section } from "~/components/Section/Section";
import type { loader as protectedLayoutLoader } from "~/routes/layouts/protected.layout";
import { select } from "~/utils/connectionsStore/selectors";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { favoriteToNode } from "~/utils/treeNodeFactories";

const MAX_SIDEBAR_ITEMS = 8;

export function FavoritesSection() {
  const connections = useConnectionsStore(select.connections);
  const layoutData = useRouteLoaderData<typeof protectedLayoutLoader>(
    "routes/layouts/protected.layout",
  );

  const nodes = useMemo(
    () =>
      (layoutData?.favorites ?? [])
        .filter((favorite) => connections[favorite.connectionId])
        .slice(0, MAX_SIDEBAR_ITEMS)
        .map(favoriteToNode),
    [layoutData, connections],
  );

  return (
    <Section
      pillar="favorites"
      badge={String(nodes.length)}
      actions={
        <IconButtonLink
          href="/favorites"
          icon="ArrowRight"
          label="View all favorites"
          variant="ghost"
          size="sm"
        />
      }
    >
      {nodes.length > 0 ? (
        <SidebarNodeList nodes={nodes} />
      ) : (
        <EmptyState icon="Star" title="No favorites" description="No favorites yet." />
      )}
    </Section>
  );
}
