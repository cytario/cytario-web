import { Button, Input, useToast } from "@cytario/design";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFetcher } from "react-router";

import { findNodeById, type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { DirectoryViewTree } from "~/components/DirectoryView/DirectoryViewTree";
import { onExpand } from "~/components/DirectoryView/onExpand";
import { LavaLoader } from "~/components/LavaLoader";
import { SearchRouteLoaderResponse } from "~/routes/search.route";
import { select } from "~/utils/connectionsStore/selectors";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { convertCsvToParquet } from "~/utils/db/convertCsvToParquet";

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

  const nodes =
    searchTerm.trim().length > 0 && objectsFetcher.data
      ? objectsFetcher.data.nodes
      : initialBuckets;
  const isLoading = objectsFetcher.state === "loading";

  // TODO(C-56): wire controlled selection + hover once DirectoryViewTree
  // exposes selection/hover props. Until then, Load is gated on a null id.
  const selectedId: string | null = null;
  const hoveredPath: string | null = null;

  const handleLoad = useCallback(async () => {
    if (!selectedId) return;
    const originalNode = findNodeById(nodes, selectedId);
    if (!originalNode) return;

    try {
      if (query === "csv") {
        convertCsvToParquet(originalNode.id);
        toast({
          variant: "success",
          message: `Started conversion: ${originalNode.name}`,
        });
      } else {
        onOverlayAdd?.({ [originalNode.id]: {} });
        toast({
          variant: "success",
          message: `Overlay added: ${originalNode.name}`,
        });
      }
      callback?.();
    } catch (error) {
      console.error("Error processing overlay:", error);
      toast({
        variant: "error",
        message: `Failed to process overlay: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  }, [selectedId, nodes, query, onOverlayAdd, toast, callback]);

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

      <DirectoryViewTree nodes={nodes} kind="entries" onExpand={onExpand} />
      <p className="truncate text-xs text-(--color-text-tertiary)">{hoveredPath ?? "…"}</p>

      <div className="flex justify-end gap-3">
        {callback && (
          <Button variant="ghost" onPress={callback}>
            Cancel
          </Button>
        )}
        <Button variant="primary" isDisabled={!selectedId} onPress={handleLoad}>
          {query === "csv" ? "Convert" : "Load"}
        </Button>
      </div>
    </div>
  );
}
