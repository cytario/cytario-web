import { Button, Input, Tree, useToast } from "@cytario/design";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFetcher } from "react-router";

import {
  type TreeNode,
  findNodeById,
} from "~/components/DirectoryView/buildDirectoryTree";
import { LavaLoader } from "~/components/LavaLoader";
import { SearchRouteLoaderResponse } from "~/routes/search.route";
import { convertCsvToParquet } from "~/utils/db/convertCsvToParquet";

interface AddOverlayProps {
  callback?: () => void;
  query: string;
  /** Called with a resourceId when a parquet overlay is selected. Not needed for CSV conversion. */
  onOverlayAdd?: (overlay: Record<string, Record<string, never>>) => void;
}

export function AddOverlay({ callback, query, onOverlayAdd }: AddOverlayProps) {
  const { toast } = useToast();

  const searchString = `/search?query=${query}`;

  // Fetch available files on mount
  const objectsFetcher = useFetcher<SearchRouteLoaderResponse>();

  useEffect(() => {
    if (!objectsFetcher.data && objectsFetcher.state === "idle") {
      objectsFetcher.load(searchString);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetcher object ref changes every render; only re-run on state transitions
  }, [objectsFetcher.state, objectsFetcher.data, searchString]);

  const nodes = useMemo(
    () => objectsFetcher.data?.nodes ?? [],
    [objectsFetcher.data?.nodes],
  );
  const isLoading = objectsFetcher.state === "loading";

  // Selection state: single file selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectedId = selectedIds.size > 0 ? [...selectedIds][0] : null;

  // Hover state: show the full path of the hovered file
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);

  const handleHover = useCallback((node: TreeNode) => {
    setHoveredPath(node.id);
  }, []);

  const handleHoverEnd = useCallback(() => {
    setHoveredPath(null);
  }, []);

  // Search/filter state
  const [searchTerm, setSearchTerm] = useState("");

  const searchMatch = useCallback(
    (node: { name: string }, term: string) =>
      node.name.toLowerCase().includes(term.toLowerCase()),
    [],
  );

  // Handle loading the selected overlay
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
      {/* Search input */}
      <Input
        aria-label={`Search ${query} files`}
        placeholder={`Search .${query} files...`}
        value={searchTerm}
        onChange={setSearchTerm}
      />

      {/* File tree */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <LavaLoader />
        </div>
      ) : nodes.length === 0 ? (
        <p className="py-8 text-center text-sm text-(--color-text-secondary)">
          No .{query} files found in connected buckets.
        </p>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-(--color-border-default)">
            <Tree
              aria-label={`Select ${query} file`}
              data={nodes}
              selectionMode="single"
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              onHover={handleHover}
              onHoverEnd={handleHoverEnd}
              openByDefault={true}
              size="compact"
              height={320}
              searchTerm={searchTerm}
              searchMatch={searchMatch}
            />
          </div>
          <p className="truncate text-xs text-(--color-text-tertiary)">
            {hoveredPath ?? "…"}
          </p>
        </>
      )}

      {/* Actions */}
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
