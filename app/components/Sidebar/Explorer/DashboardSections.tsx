import { useMemo } from "react";

import type { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { NodeLink } from "~/components/DirectoryView/NodeLink/NodeLink";
import { FeatureItem } from "~/components/FeatureItem/FeatureItem";
import { select } from "~/utils/connectionsStore/selectors";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { favoriteToNode, recentToNode } from "~/utils/dashboardNodes";
import { useDashboardStore } from "~/utils/dashboardStore/useDashboardStore";

const MAX_SIDEBAR_ITEMS = 8;

function SidebarNodeList({ nodes }: { nodes: TreeNode[] }) {
  return (
    <div className="flex flex-col px-2">
      {nodes.map((node) => (
        <NodeLink key={node.id} node={node} contextMenu={false} />
      ))}
    </div>
  );
}

/**
 * Compact Recents + Favorites sections for the explorer sidebar, sourced from
 * the dashboard store (seeded by the protected layout). Items navigate to the
 * resource; entries whose connection is no longer visible are dropped.
 */
export function DashboardSections() {
  const connections = useConnectionsStore(select.connections);
  const recentlyViewed = useDashboardStore((s) => s.recentlyViewed);
  const favorites = useDashboardStore((s) => s.favorites);

  const recentNodes = useMemo(
    () =>
      recentlyViewed
        .filter((item) => connections[item.connectionName])
        .slice(0, MAX_SIDEBAR_ITEMS)
        .map(recentToNode),
    [recentlyViewed, connections],
  );

  const favoriteNodes = useMemo(
    () =>
      favorites
        .filter((favorite) => connections[favorite.connectionName])
        .slice(0, MAX_SIDEBAR_ITEMS)
        .map(favoriteToNode),
    [favorites, connections],
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
