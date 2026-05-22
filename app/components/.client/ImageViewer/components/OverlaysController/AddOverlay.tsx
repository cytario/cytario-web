import { Button, Input, useToast } from "@cytario/design";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFetcher } from "react-router";

import { collectInteriorIds, type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { DirectoryViewTree } from "~/components/DirectoryView/DirectoryViewTree";
import { onExpand as defaultOnExpand } from "~/components/DirectoryView/onExpand";
import { LavaLoader } from "~/components/LavaLoader";
import { SearchRouteLoaderResponse } from "~/routes/search.route";
import { select } from "~/utils/connectionsStore/selectors";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { convertCsvToParquet } from "~/utils/db/convertCsvToParquet";

/**
 * Prune file nodes that don't end in `.${ext}`. Lazy stubs (`loadState`
 * `"idle"`) are kept since their contents are unknown until expanded;
 * loaded directories are kept only when at least one descendant matches.
 */
function filterByExtension(nodes: TreeNode[], ext: string): TreeNode[] {
  const suffix = `.${ext.toLowerCase()}`;
  return nodes.flatMap((n) => {
    if (n.type === "file") return n.name.toLowerCase().endsWith(suffix) ? [n] : [];
    if (n.loadState === "idle") return [n];
    const children = n.children ? filterByExtension(n.children, ext) : [];
    return children.length > 0 ? [{ ...n, children }] : [];
  });
}

interface AddOverlayProps {
  callback?: () => void;
  query: string;
  /** Called with a resourceId when a parquet overlay is selected. Not needed for CSV conversion. */
  onOverlayAdd?: (overlay: Record<string, Record<string, never>>) => void;
}

const SEARCH_DEBOUNCE_MS = 250;

export function AddOverlay({ callback, query, onOverlayAdd }: AddOverlayProps) {
  const { toast } = useToast();
  const objectsFetcher = useFetcher<SearchRouteLoaderResponse>();
  const connections = useConnectionsStore(select.connections);

  const [searchTerm, setSearchTerm] = useState("");

  // Fetch only when user types. Empty input → tree shows the collapsed
  // bucket roots from the connections store.
  useEffect(() => {
    const trimmed = searchTerm.trim();
    if (trimmed.length === 0) return;
    const handle = setTimeout(() => {
      objectsFetcher.load(`/search?query=${encodeURIComponent(trimmed)}`);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetcher object ref changes every render; only re-run on input changes
  }, [searchTerm]);

  const initialBuckets = useMemo<TreeNode[]>(
    () =>
      Object.values(connections).map(({ connectionConfig }) => ({
        id: `${connectionConfig.name}/`,
        connectionName: connectionConfig.name,
        name: connectionConfig.name,
        type: "bucket" as const,
        pathName: "",
        children: [],
        loadState: "idle" as const,
      })),
    [connections],
  );

  const rawNodes =
    searchTerm.trim().length > 0 && objectsFetcher.data
      ? objectsFetcher.data.nodes
      : initialBuckets;

  // CSV path stays unfiltered (we'll split components later). For "parquet"
  // the dialog only surfaces `.parquet` files.
  const shouldFilter = query === "parquet";
  const nodes = useMemo(
    () => (shouldFilter ? filterByExtension(rawNodes, query) : rawNodes),
    [rawNodes, query, shouldFilter],
  );

  const onExpand = useCallback(
    async (parent: TreeNode) => {
      const children = await defaultOnExpand(parent);
      return shouldFilter ? filterByExtension(children, query) : children;
    },
    [query, shouldFilter],
  );

  const isLoading = objectsFetcher.state === "loading";

  const isSearching = searchTerm.trim().length > 0;
  const defaultExpandedItems = useMemo(() => collectInteriorIds(nodes), [nodes]);

  const handleSelect = useCallback(
    (node: TreeNode) => {
      if (node.type !== "file") return;
      try {
        if (query === "csv") {
          convertCsvToParquet(node.id);
          toast({ variant: "success", message: `Started conversion: ${node.name}` });
        } else {
          onOverlayAdd?.({ [node.id]: {} });
          toast({ variant: "success", message: `Overlay added: ${node.name}` });
        }
        callback?.();
      } catch (error) {
        console.error("Error processing overlay:", error);
        toast({
          variant: "error",
          message: `Failed to process overlay: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    },
    [query, onOverlayAdd, toast, callback],
  );

  return (
    <div className="flex flex-col gap-3">
      <Input
        aria-label={`Search ${query} files`}
        placeholder={`Search .${query} files...`}
        value={searchTerm}
        onChange={setSearchTerm}
      />

      {isLoading && (
        <div className="flex items-center justify-center py-2">
          <LavaLoader />
        </div>
      )}

      <DirectoryViewTree
        key={isSearching ? `search:${objectsFetcher.data?.searchQuery ?? "loading"}` : "lazy"}
        nodes={nodes}
        kind="entries"
        onExpand={onExpand}
        defaultExpandedItems={isSearching ? defaultExpandedItems : undefined}
        nodeLinkProps={{
          onClick: handleSelect,
          contextMenu: false,
          isClickable: (node) => node.type === "file",
        }}
      />

      {callback && (
        <div className="flex justify-end">
          <Button variant="ghost" onPress={callback}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
