import { useMemo } from "react";
import { useRouteLoaderData } from "react-router";

import type { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { NodeLink } from "~/components/DirectoryView/NodeLink/NodeLink";
import { FeatureItem } from "~/components/FeatureItem/FeatureItem";
import type { loader as protectedLayoutLoader } from "~/routes/layouts/protected.layout";
import { select } from "~/utils/connectionsStore/selectors";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { favoriteToNode, recentToNode } from "~/utils/dashboardNodes";

const MAX_SIDEBAR_ITEMS = 8;

function SidebarNodeList({ nodes }: { nodes: TreeNode[] }) {
  return (
    <div className="flex flex-col px-2">
      {nodes.map((node) => (
        <NodeLink key={node.id} node={node} />
      ))}
    </div>
  );
}

/** Compact Recents + Favorites sections for the explorer sidebar. */
export function DashboardSections() {
  const connections = useConnectionsStore(select.connections);
  const layoutData = useRouteLoaderData<typeof protectedLayoutLoader>(
    "routes/layouts/protected.layout",
  );
  const recentNodes = useMemo(
    () =>
      (layoutData?.recentlyViewed ?? [])
        .filter((item) => connections[item.connectionName])
        .slice(0, MAX_SIDEBAR_ITEMS)
        .map(recentToNode),
    [layoutData, connections],
  );

  const favoriteNodes = useMemo(
    () =>
      (layoutData?.favorites ?? [])
        .filter((favorite) => connections[favorite.connectionName])
        .slice(0, MAX_SIDEBAR_ITEMS)
        .map(favoriteToNode),
    [layoutData, connections],
  );

  return (
    <>
      {favoriteNodes.length > 0 && (
        <FeatureItem title="Favorites" badge={String(favoriteNodes.length)}>
          <SidebarNodeList nodes={favoriteNodes} />
        </FeatureItem>
      )}
      {recentNodes.length > 0 && (
        <FeatureItem title="Recent" badge={String(recentNodes.length)}>
          <SidebarNodeList nodes={recentNodes} />
        </FeatureItem>
      )}
    </>
  );
}
