import { useEffect, useState } from "react";

import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import type { TreeFilters } from "~/components/DirectoryView/treeFilters";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { searchConnection } from "~/utils/searchConnection";

interface ConnectionSearch {
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

// Recursive search of one connection. `query` is already debounced by
// SearchInput. Results are keyed by connection+query+filters so
// isSearching/nodes derive cleanly without resetting state in the effect.
export function useConnectionSearch(
  connectionId: string,
  query: string,
  filters?: TreeFilters,
): ConnectionSearch {
  const hasCreds = useConnectionsStore((s) => !!s.connections[connectionId]?.credentials);
  const [result, setResult] = useState<SearchResult>({
    key: "",
    nodes: [],
    error: false,
    corsBlocked: false,
  });
  const key = `${connectionId} ${query} ${JSON.stringify(filters ?? {})}`;

  useEffect(() => {
    if (!query || !hasCreds) return;
    const connection = useConnectionsStore.getState().connections[connectionId];
    if (!connection) return;

    const controller = new AbortController();
    searchConnection({ connection, query, filters, signal: controller.signal }).then((r) => {
      if (controller.signal.aborted) return;
      setResult({ key, nodes: r.node.children ?? [], error: r.error, corsBlocked: r.corsBlocked });
    });

    return () => controller.abort();
  }, [key, query, filters, connectionId, hasCreds]);

  const matched = !!query && result.key === key;
  return {
    nodes: matched ? result.nodes : [],
    // No credentials → immediate error (can't search), not a spinner.
    isSearching: !!query && hasCreds && !matched,
    error: !!query && (!hasCreds || (matched && result.error)),
    corsBlocked: matched && result.corsBlocked,
  };
}
