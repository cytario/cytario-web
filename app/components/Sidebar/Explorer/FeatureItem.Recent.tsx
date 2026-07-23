import { EmptyState, IconButtonLink } from "@cytario/design";
import { useMemo } from "react";
import { useRouteLoaderData } from "react-router";

import { SidebarNodeList } from "./SidebarNodeList";
import { FeatureItem } from "~/components/FeatureItem/FeatureItem";
import type { loader as protectedLayoutLoader } from "~/routes/layouts/protected.layout";
import { select } from "~/utils/connectionsStore/selectors";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { recentToNode } from "~/utils/treeNodeFactories";

const MAX_SIDEBAR_ITEMS = 8;

export function FeatureItemRecent() {
  const connections = useConnectionsStore(select.connections);
  const layoutData = useRouteLoaderData<typeof protectedLayoutLoader>(
    "routes/layouts/protected.layout",
  );

  const nodes = useMemo(
    () =>
      (layoutData?.recentlyViewed ?? [])
        .filter((item) => connections[item.connectionId])
        .slice(0, MAX_SIDEBAR_ITEMS)
        .map(recentToNode),
    [layoutData, connections],
  );

  return (
    <FeatureItem
      title="Recent"
      badge={String(nodes.length)}
      actions={
        <IconButtonLink
          href="/recent"
          icon="ArrowRight"
          label="View all recent items"
          variant="ghost"
          size="sm"
        />
      }
    >
      {nodes.length > 0 ? (
        <SidebarNodeList nodes={nodes} />
      ) : (
        <EmptyState
          icon="Clock"
          title="Nothing recent"
          description="No recently viewed items yet."
        />
      )}
    </FeatureItem>
  );
}
