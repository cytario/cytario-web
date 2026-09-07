import { Badge, Button, EmptyState, useToast } from "@cytario/design";
import { useCallback, useMemo, useState } from "react";

import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { SearchInput } from "~/components/SearchInput";
import { ConnectionSwitcherChip } from "~/components/Sidebar/ConnectionSwitcherChip";
import { ConnectionTree } from "~/components/Sidebar/ConnectionTree";
import { select } from "~/utils/connectionsStore/selectors";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { convertCsvToParquet } from "~/utils/db/convertCsvToParquet";
import { getFileTypeEntry } from "~/utils/fileType";
import { parseResourceId } from "~/utils/resourceId";

interface AddOverlayProps {
  callback?: () => void;
  /** File kind to surface: "parquet" adds overlays, "csv" starts a conversion. */
  extension: "csv" | "parquet";
  /** Called with a resourceId when a parquet overlay is selected. Not needed for CSV conversion. */
  onOverlayAdd?: (overlay: Record<string, Record<string, never>>) => void;
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
      if (node.type !== "file") return;
      try {
        if (extension === "csv") {
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
    [extension, onOverlayAdd, toast, callback],
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
