import { EmptyState } from "@cytario/design";
import { AlertTriangle, SearchX } from "lucide-react";
import { useMemo } from "react";

import { useSidebarSearch } from "./Explorer/useSidebarSearch";
import { collectInteriorIds, type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { DirectoryViewTree } from "~/components/DirectoryView/DirectoryViewTree";
import { onExpand } from "~/components/DirectoryView/onExpand";
import { LavaLoader } from "~/components/LavaLoader";
import { ancestorDirIds } from "~/utils/resourceId";

interface ConnectionTreeProps {
  selectedConnection: string;
  query: string;
  /**
   * Decoded path of the resource the current route points at (S3-key form).
   * When set, the tree mounts with every ancestor folder pre-expanded so a
   * deep link / reload reveals where the resource lives. Omit to show only the
   * collapsed root.
   */
  activePathName?: string;
}

export function ConnectionTree({ selectedConnection, query, activePathName }: ConnectionTreeProps) {
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

  const browseExpanded = useMemo(
    () => (activePathName ? ancestorDirIds(selectedConnection, activePathName) : [rootId]),
    [activePathName, selectedConnection, rootId],
  );

  if (query) {
    if (isSearching && searchNodes.length === 0) {
      return <LavaLoader rows={4} cols={3} />;
    }
    if (error) {
      return (
        <EmptyState
          icon={AlertTriangle}
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
        <EmptyState icon={SearchX} title="No matches" description={`Nothing matches “${query}”.`} />
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
      defaultExpandedItems={browseExpanded}
      revealItems={browseExpanded}
    />
  );
}
