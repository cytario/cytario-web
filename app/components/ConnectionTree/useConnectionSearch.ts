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
  /** The scan hit a cap (MAX_SEARCH_DIRS / per-level entry cap) — results may be partial. */
  isCapped: boolean;
}

interface SearchResult {
  key: string;
  nodes: TreeNode[];
  error: boolean;
  corsBlocked: boolean;
  isCapped: boolean;
}

// Recursive search of one connection. `query` is already debounced by
// SearchInput. Results are keyed by connection+query+filters so
// isSearching/nodes derive cleanly without resetting state in the effect.
// The scan runs when either a query or an extension filter is active — the
// extension scope alone prunes empty directories and needs the full walk.
export function useConnectionSearch(
  connectionId: string,
  query: string,
  filters?: TreeFilters,
): ConnectionSearch {
  const hasCreds = useConnectionsStore((s) => !!s.connections[connectionId]?.credentials);
  const hasExtensions = !!filters?.extensions?.length;
  const active = !!query || hasExtensions;
  const [result, setResult] = useState<SearchResult>({
    key: "",
    nodes: [],
    error: false,
    corsBlocked: false,
    isCapped: false,
  });
  const key = `${connectionId} ${query} ${JSON.stringify(filters ?? {})}`;

  useEffect(() => {
    if (!active || !hasCreds) return;
    const connection = useConnectionsStore.getState().connections[connectionId];
    if (!connection) return;

    const controller = new AbortController();
    searchConnection({ connection, query, filters, signal: controller.signal }).then((r) => {
      if (controller.signal.aborted) return;
      setResult({
        key,
        nodes: r.node.children ?? [],
        error: r.error,
        corsBlocked: r.corsBlocked,
        isCapped: r.isCapped,
      });
    });

    return () => controller.abort();
    // `key` serializes connection + query + filters, so it is the complete dep:
    // caller-side `filters` identity churn (inline literals) must not re-trigger
    // the walk. Everything else in the closure is captured from the render that
    // produced the changed key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, hasCreds]);

  const matched = active && result.key === key;
  return {
    nodes: matched ? result.nodes : [],
    // No credentials → immediate error (can't search), not a spinner.
    isSearching: active && hasCreds && !matched,
    error: active && (!hasCreds || (matched && result.error)),
    corsBlocked: matched && result.corsBlocked,
    isCapped: matched && result.isCapped,
  };
}
