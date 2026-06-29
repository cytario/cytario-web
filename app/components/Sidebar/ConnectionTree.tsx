import { EmptyState } from "@cytario/design";
import { useMemo } from "react";

import { useSidebarSearch } from "./Explorer/useSidebarSearch";
import { collectInteriorIds, type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { DirectoryViewTree } from "~/components/DirectoryView/DirectoryViewTree";
import { onExpand } from "~/components/DirectoryView/onExpand";
import { LavaLoader } from "~/components/LavaLoader";

interface ConnectionTreeProps {
  selectedConnection: string;
  query: string;
}

export function ConnectionTree({ selectedConnection, query }: ConnectionTreeProps) {
  const rootId = `${selectedConnection}/`;
  const {
    nodes: searchNodes,
    isSearching,
    error,
    corsBlocked,
  } = useSidebarSearch(selectedConnection, query);

  const rootNodes = useMemo<TreeNode[]>(
    () => [
      {
        id: rootId,
        connectionName: selectedConnection,
        type: "bucket", // NodeIndicator only shows the status dot for buckets
        name: selectedConnection,
        pathName: "",
        children: [],
        hasChildren: true,
        isLeaf: false,
        loadState: "idle",
      },
    ],
    [rootId, selectedConnection],
  );

  const searchExpanded = useMemo(() => collectInteriorIds(searchNodes), [searchNodes]);

  if (query) {
    if (isSearching && searchNodes.length === 0) {
      return <LavaLoader rows={4} cols={3} />;
    }
    if (error) {
      return (
        <EmptyState
          icon="AlertTriangle"
          title="Search failed"
          description={
            corsBlocked
              ? "The browser was blocked from reading this bucket — check its CORS policy."
              : "Could not search this connection. Check the connection and try again."
          }
        />
      );
    }
    if (searchNodes.length === 0) {
      return (
        <EmptyState icon="SearchX" title="No matches" description={`Nothing matches “${query}”.`} />
      );
    }
    return (
      <DirectoryViewTree
        key={`search:${selectedConnection}`}
        nodes={searchNodes}
        kind="entries"
        defaultExpandedItems={searchExpanded}
      />
    );
  }

  return (
    <DirectoryViewTree
      // Remount on connection change to reset headless-tree's id cache.
      key={selectedConnection}
      nodes={rootNodes}
      kind="entries"
      onExpand={onExpand}
      defaultExpandedItems={[rootId]}
    />
  );
}
