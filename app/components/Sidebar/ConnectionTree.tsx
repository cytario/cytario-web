import { EmptyState } from "@cytario/design";
import { useMemo } from "react";

import { LoaderView } from "../Loader/LoaderView";
import { collectInteriorIds, type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { DirectoryViewTree } from "~/components/DirectoryView/DirectoryViewTree";
import type { NodeLinkProps } from "~/components/DirectoryView/NodeLink/NodeLink";
import { onExpand } from "~/components/DirectoryView/onExpand";
import { type TreeFilters } from "~/components/DirectoryView/treeFilters";
import { useLayoutStore } from "~/components/DirectoryView/useLayoutStore";
import { Divider } from "~/components/Divider/Divider";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { ancestorDirIds } from "~/utils/resourceId";
import { useConnectionSearch } from "~/utils/useConnectionSearch";

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
  /** Visibility filters (extensions, …) merged over the sidebar's show-hidden
   * toggle. Applied at both scan time (search) and render time. */
  filters?: TreeFilters;
  /** Extra NodeLink props, merged after the internal highlightQuery. */
  nodeLinkProps?: Omit<NodeLinkProps, "node">;
}

/** Number of search-result leaves (interior structure dirs don't count). */
const countLeaves = (nodes: TreeNode[]): number =>
  nodes.reduce((acc, n) => acc + (n.children?.length ? countLeaves(n.children) : 1), 0);

export function ConnectionTree({
  selectedConnection,
  query,
  activePathName,
  filters,
  nodeLinkProps,
}: ConnectionTreeProps) {
  const rootId = `${selectedConnection}/`;
  const connectionName =
    useConnectionsStore((s) => s.connections[selectedConnection]?.connectionConfig.name) ??
    selectedConnection;
  const showHiddenFiles = useLayoutStore((s) => s.showHiddenFiles);
  // Sidebar toggle is the default; caller filters (e.g. AddOverlay's
  // extensions) are merged on top.
  const effectiveFilters = useMemo(
    () => ({ showHiddenFiles, ...filters }),
    [showHiddenFiles, filters],
  );
  const {
    nodes: searchNodes,
    isSearching,
    error,
    corsBlocked,
  } = useConnectionSearch(selectedConnection, query, effectiveFilters);

  const rootNodes = useMemo<TreeNode[]>(
    () => [
      {
        id: rootId,
        connectionId: selectedConnection,
        connectionName,
        type: "bucket",
        name: connectionName,
        pathName: "",
        children: [],
        isLeaf: false,
        loadState: "idle",
      },
    ],
    [rootId, selectedConnection, connectionName],
  );

  const searchExpanded = useMemo(() => collectInteriorIds(searchNodes), [searchNodes]);
  const resultCount = useMemo(() => countLeaves(searchNodes), [searchNodes]);

  const browseExpanded = useMemo(
    () => (activePathName ? ancestorDirIds(selectedConnection, activePathName) : [rootId]),
    [activePathName, selectedConnection, rootId],
  );

  if (query) {
    if (isSearching && searchNodes.length === 0) {
      return <LoaderView label={`Searching for “${query}”…`} />;
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
      <div className="flex flex-col gap-1">
        <Divider aria-live="polite">
          {resultCount} {resultCount === 1 ? "result" : "results"}
          {isSearching ? " — searching…" : ""}
        </Divider>
        <DirectoryViewTree
          key={`search:${selectedConnection}`}
          nodes={searchNodes}
          kind="entries"
          defaultExpandedItems={searchExpanded}
          nodeLinkProps={{ highlightQuery: query, ...nodeLinkProps }}
          filters={effectiveFilters}
        />
      </div>
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
      nodeLinkProps={nodeLinkProps}
      filters={effectiveFilters}
    />
  );
}
