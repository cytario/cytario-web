import { useEffect, useState } from "react";

import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { searchConnection } from "~/utils/searchConnection";

interface SidebarSearch {
  nodes: TreeNode[];
  isSearching: boolean;
  error: boolean;
  corsBlocked: boolean;
}

interface SearchResult {
  key: string;
  nodes: TreeNode[];
  error: boolean;
  corsBlocked: boolean;
}

// Recursive search of the selected connection. `query` is already debounced by
// SidebarSearchInput. Results are keyed by connection+query so isSearching/nodes
// derive cleanly without resetting state in the effect.
export function useSidebarSearch(connectionId: string, query: string): SidebarSearch {
  const hasCreds = useConnectionsStore((s) => !!s.connections[connectionId]?.credentials);
  const [result, setResult] = useState<SearchResult>({
    key: "",
    nodes: [],
    error: false,
    corsBlocked: false,
  });
  const key = `${connectionId} ${query}`;

  useEffect(() => {
    if (!query || !hasCreds) return;
    const connection = useConnectionsStore.getState().connections[connectionId];
    if (!connection) return;

    const controller = new AbortController();
    searchConnection({ connection, query, signal: controller.signal }).then((r) => {
      if (controller.signal.aborted) return;
      setResult({ key, nodes: r.node.children ?? [], error: r.error, corsBlocked: r.corsBlocked });
    });

    return () => controller.abort();
  }, [key, query, connectionId, hasCreds]);

  const matched = !!query && result.key === key;
  return {
    nodes: matched ? result.nodes : [],
    // No credentials → immediate error (can't search), not a spinner.
    isSearching: !!query && hasCreds && !matched,
    error: !!query && (!hasCreds || (matched && result.error)),
    corsBlocked: matched && result.corsBlocked,
  };
}
