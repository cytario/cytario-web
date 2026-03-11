import { Button, Input, Tree, useToast } from "@cytario/design";
import type { TreeNode as DesignTreeNode } from "@cytario/design";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFetcher } from "react-router";

import { findOriginalNode, toDesignTreeNodes } from "./toDesignTreeNodes";
import { select } from "../../state/selectors";
import { useViewerStore } from "../../state/ViewerStoreContext";
import { LavaLoader } from "~/components/LavaLoader";
import { SearchRouteLoaderResponse } from "~/routes/search.route";
import { useConnectionsStore } from "~/utils/connectionsStore";
import { convertCsvToParquet } from "~/utils/db/convertCsvToParquet";
import { createResourceId } from "~/utils/resourceId";

const QUERY_EXTENSION_MAP: Record<string, "csv" | "parquet"> = {
  "convert-overlay": "csv",
  "load-overlay": "parquet",
};

interface AddOverlayProps {
  callback?: () => void;
  query: string;
}

export function AddOverlay({ callback, query }: AddOverlayProps) {
  const addOverlaysState = useViewerStore(select.addOverlaysState);
  const { toast } = useToast();

  const extension = QUERY_EXTENSION_MAP[query];
  const searchString = `/search?query=${extension}`;

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

  // Convert to design system tree format
  const treeData = useMemo(() => toDesignTreeNodes(nodes), [nodes]);

  // Selection state: single file selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectedId = selectedIds.size > 0 ? [...selectedIds][0] : null;

  // Hover state: show the full path of the hovered file
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);

  const handleHover = useCallback(
    (node: DesignTreeNode) => {
      // The design tree node id is the pathName (or name for buckets)
      setHoveredPath(node.id);
    },
    [],
  );

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

    const originalNode = findOriginalNode(nodes, selectedId);
    if (!originalNode) return;

    try {
      if (!originalNode.pathName || !originalNode.bucketName) {
        throw new Error("Invalid node selected");
      }

      const resourceId = createResourceId(
        originalNode.provider,
        originalNode.bucketName,
        originalNode.pathName,
      );

      // Find connection record matching this node's provider/bucketName
      const { connections } = useConnectionsStore.getState();
      const conn = Object.values(connections).find(
        (r) =>
          r.connectionConfig?.provider === originalNode.provider &&
          r.connectionConfig?.bucketName === originalNode.bucketName,
      );
      const credentials = conn?.credentials;
      const connectionConfig = conn?.connectionConfig;

      if (!connectionConfig) {
        throw new Error("Connection configuration not found");
      }

      if (!credentials) {
        throw new Error(`No credentials found for bucket: ${originalNode.bucketName}`);
      }

      if (extension === "csv") {
        convertCsvToParquet(resourceId, credentials);
        toast({
          variant: "success",
          message: `Started conversion: ${originalNode.name}`,
        });
      } else {
        addOverlaysState({ [resourceId]: {} });
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
  }, [selectedId, nodes, extension, addOverlaysState, toast, callback]);

  return (
    <div className="flex flex-col gap-3">
      {/* Search input */}
      <Input
        aria-label={`Search ${extension} files`}
        placeholder={`Search .${extension} files...`}
        value={searchTerm}
        onChange={setSearchTerm}
      />

      {/* File tree */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <LavaLoader />
        </div>
      ) : treeData.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--color-text-secondary)]">
          No .{extension} files found in connected buckets.
        </p>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-[var(--color-border-default)]">
            <Tree
              aria-label={`Select ${extension} file`}
              data={treeData}
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
          {hoveredPath && (
            <p className="truncate text-xs text-[var(--color-text-tertiary)]">
              {hoveredPath}
            </p>
          )}
        </>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3">
        {callback && (
          <Button variant="ghost" onPress={callback}>
            Cancel
          </Button>
        )}
        <Button
          variant="primary"
          isDisabled={!selectedId}
          onPress={handleLoad}
        >
          {extension === "csv" ? "Convert" : "Load"}
        </Button>
      </div>
    </div>
  );
}
