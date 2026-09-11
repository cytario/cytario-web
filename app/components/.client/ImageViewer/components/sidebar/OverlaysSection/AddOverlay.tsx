import { Badge, Button, EmptyState, useToast } from "@cytario/design";
import { useCallback, useMemo, useState } from "react";

import { type OverlayEntry } from "~/components/.client/ImageViewer/state/store/types";
import { ConnectionSwitcherChip } from "~/components/ConnectionTree/ConnectionSwitcherChip";
import { ConnectionTree } from "~/components/ConnectionTree/ConnectionTree";
import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { SearchInput } from "~/components/SearchInput";
import { select } from "~/utils/connectionsStore/selectors";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { convertCsvToParquet } from "~/utils/db/convertCsvToParquet";
import { getOverlaySchema } from "~/utils/db/getOverlaySchema";
import { getFileTypeEntry } from "~/utils/fileType";
import { parseResourceId } from "~/utils/resourceId";

interface AddOverlayProps {
  callback?: () => void;
  /** File kind to surface: "parquet" adds overlays, "csv" starts a conversion. */
  extension: "csv" | "parquet";
  /** Called with per-resource overlay entries when a parquet overlay is selected. Not needed for CSV conversion. */
  onOverlayAdd?: (overlay: Record<string, OverlayEntry>) => void;
  /** Resource the user is coming from — preselects its connection and prefills search with its name. */
  sourceResourceId?: string;
}

export function AddOverlay({
  callback,
  extension,
  onOverlayAdd,
  sourceResourceId,
}: AddOverlayProps) {
  const { toast } = useToast();
  const connections = useConnectionsStore(select.connections);
  const connectionIds = useMemo(() => Object.keys(connections), [connections]);
  const [busy, setBusy] = useState(false);

  const { connectionId: sourceConnection, name: sourceName } = useMemo(
    () => (sourceResourceId ? parseResourceId(sourceResourceId) : { connectionId: "", name: "" }),
    [sourceResourceId],
  );

  const [override, setOverride] = useState<string | null>(sourceConnection || null);
  const [searchTerm, setSearchTerm] = useState(sourceName);
  const selectedConnection = override ?? connectionIds[0] ?? "";

  // Registry entry for the picker's extension scope ("Parquet" / "CSV").
  const scopeType = getFileTypeEntry(`file.${extension}`);

  const handleSelect = useCallback(
    (node: TreeNode) => {
      if (node.type !== "file" || busy) return;
      setBusy(true);
      const finish = () => {
        setBusy(false);
        callback?.();
      };
      try {
        if (extension === "csv") {
          convertCsvToParquet(node.id);
          toast({ variant: "success", message: `Started conversion: ${node.name}` });
          finish();
          return;
        }
        // Introspect the parquet so the overlay carries its column mapping from
        // the start; a null config still adds the overlay entry and surfaces one
        // actionable error (the item row's Configure action opens the editor).
        void getOverlaySchema(node.id)
          .then(({ config }) => {
            onOverlayAdd?.({ [node.id]: { markers: {}, config } });
            if (config) {
              toast({ variant: "success", message: `Overlay added: ${node.name}` });
            } else {
              toast({
                variant: "error",
                message: `Could not interpret columns in ${node.name} — open Configure to map them manually`,
              });
            }
          })
          .catch((error: unknown) => {
            console.error("Error reading overlay schema:", error);
            onOverlayAdd?.({ [node.id]: { markers: {}, config: null } });
            toast({
              variant: "error",
              message: `Failed to process overlay: ${error instanceof Error ? error.message : "Unknown error"}`,
            });
          })
          .finally(finish);
      } catch (error) {
        console.error("Error processing overlay:", error);
        toast({
          variant: "error",
          message: `Failed to process overlay: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
        finish();
      }
    },
    [extension, onOverlayAdd, toast, callback, busy],
  );

  if (!selectedConnection) {
    return (
      <EmptyState
        icon="Unplug"
        title="No connections"
        description="No connections are available yet."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ConnectionSwitcherChip
        selectedConnection={selectedConnection}
        onSelect={(id) => setOverride(id || null)}
      />
      <SearchInput
        aria-label={`Search ${extension} files`}
        placeholder="Search files..."
        onQueryChange={setSearchTerm}
        defaultValue={sourceName}
        suffix={
          // Scope indicator — the same badge file rows render, so what the
          // picker admits matches what the rows show.
          <Badge icon={scopeType?.icon}>{scopeType?.type ?? `.${extension}`}</Badge>
        }
      />

      <ConnectionTree
        selectedConnection={selectedConnection}
        query={searchTerm}
        filters={{ extensions: [extension] }}
        nodeLinkProps={{ onClick: handleSelect, isClickable: (node) => node.type === "file" }}
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
