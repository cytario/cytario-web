import { useEffect, useState } from "react";

import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { useLayoutStore } from "~/components/DirectoryView/useLayoutStore";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { searchConnection } from "~/utils/searchConnection";

interface SidebarSearch {
  query: string;
  nodes: TreeNode[];
  isSearching: boolean;
}

// Recursive search of the selected connection. `searchQuery` is already
// debounced by SidebarSearchInput before it lands in the store. Results are
// keyed by the query they belong to, so isSearching/nodes derive cleanly
// without resetting state in the effect.
export function useSidebarSearch(connectionName: string): SidebarSearch {
  const query = useLayoutStore((s) => s.sidebarSearchQuery).trim();
  const [result, setResult] = useState<{ query: string; nodes: TreeNode[] }>({
    query: "",
    nodes: [],
  });

  useEffect(() => {
    if (!query) return;
    const connection = useConnectionsStore.getState().connections[connectionName];
    if (!connection?.credentials) return;

    const controller = new AbortController();
    searchConnection({ connection, query, signal: controller.signal }).then((r) => {
      if (!controller.signal.aborted) setResult({ query, nodes: r.node.children ?? [] });
    });

    return () => controller.abort();
  }, [query, connectionName]);

  const matched = !!query && result.query === query;
  return { query, nodes: matched ? result.nodes : [], isSearching: !!query && !matched };
}
