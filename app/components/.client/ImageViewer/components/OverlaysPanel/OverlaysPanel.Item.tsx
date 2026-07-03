import { MenuItem, useToast } from "@cytario/design";
import { useEffect, useMemo, useState } from "react";
import { RadioGroup } from "react-aria-components";
import { twMerge } from "tailwind-merge";

import { getOverlayState } from "./getOverlayState";
import { select } from "../../state/store/selectors";
import { ChannelsStateColumns, OverlayState } from "../../state/store/types";
import { useViewerStore } from "../../state/store/ViewerStoreContext";
import { ChannelsPanelItem } from "../ChannelsPanel/ChannelsPanelItem";
import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { NodeLink } from "~/components/DirectoryView/NodeLink/NodeLink";
import { LavaLoader } from "~/components/LavaLoader";
import { select as connectionsSelect } from "~/utils/connectionsStore/selectors";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { getMarkerInfoWasm } from "~/utils/db/getMarkerInfoWasm";
import { useFileStore } from "~/utils/localFilesStore/useFileStore";
import { parseResourceId } from "~/utils/resourceId";

interface OverlaysPanelItemProps {
  resourceId: string;
  overlayState: OverlayState;
}

export const OverlaysPanelItem = ({ resourceId, overlayState }: OverlaysPanelItemProps) => {
  const setMarkerVisibility = useViewerStore(select.setMarkerVisibility);
  const setMarkerColor = useViewerStore(select.setMarkerColor);
  const removeOverlaysState = useViewerStore(select.removeOverlaysState);
  const updateOverlaysState = useViewerStore(select.updateOverlaysState);
  const { toast } = useToast();

  // Get file download progress from the file store
  const fileProgress = useFileStore((state) => state.files[resourceId]?.progress);

  const cx = twMerge("flex flex-col px-3");

  const [isOpen, setIsOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const { connectionName, pathName, fileName } = parseResourceId(resourceId);
  const hasMarkers = Object.keys(overlayState).length > 0;

  // The overlay file as a TreeNode, so the file row renders as the shared
  // NodeLink (icon + name + context menu) used across the directory views.
  const node = useMemo<TreeNode>(
    () => ({
      id: resourceId,
      connectionName,
      pathName,
      name: fileName,
      type: "file",
      isLeaf: true,
    }),
    [resourceId, connectionName, pathName, fileName],
  );

  // Calculate maxDomain from actual marker counts (for progress bar scaling)
  const maxDomain = Math.max(
    ...Object.values(overlayState).map(({ count }) => count),
    1, // Prevent division by zero
  );

  const connectionConfig = useConnectionsStore(connectionsSelect.connectionConfig(connectionName));

  // Fetch markers on mount if not already loaded
  useEffect(() => {
    if (hasMarkers || !connectionConfig) return;

    const fetchMarkers = async () => {
      setIsLoading(true);
      try {
        const markerInfo = await getMarkerInfoWasm(resourceId);
        if (markerInfo && Object.keys(markerInfo).length > 0) {
          const newOverlayState = getOverlayState(markerInfo);
          updateOverlaysState(resourceId, newOverlayState);
        } else {
          toast({
            variant: "error",
            message: `No marker columns found in ${fileName}`,
          });
        }
      } catch (error) {
        console.error("Error fetching markers:", error);
        toast({
          variant: "error",
          message: `Failed to load markers for ${fileName}`,
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchMarkers();
  }, [hasMarkers, resourceId, connectionConfig, updateOverlaysState, toast, fileName]);

  return (
    <div className="flex flex-col">
      {/* File row: clicking the name toggles the marker list; navigation and
          removal live in the node's context menu. */}
      <div className="p-2">
        <NodeLink
          node={node}
          onClick={() => setIsOpen(!isOpen)}
          contextMenuItems={
            <MenuItem
              id="remove-overlay"
              icon="X"
              isDanger
              onAction={() => {
                const confirmation = confirm(
                  `Are you sure you want to remove overlay "${fileName}"?`,
                );
                if (confirmation) removeOverlaysState(resourceId);
              }}
            >
              Remove overlay
            </MenuItem>
          }
        />
      </div>

      {/* Body */}
      {isOpen && (
        <RadioGroup aria-label="Overlay markers" className={cx}>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-2 p-4">
              <LavaLoader />
              {fileProgress && fileProgress.percentage < 100 && (
                <div className="text-sm">Downloading: {Math.round(fileProgress.percentage)}%</div>
              )}
            </div>
          ) : hasMarkers ? (
            Object.entries(overlayState).map(([markerName, { color, count, isVisible }]) => {
              return (
                <ChannelsPanelItem
                  key={markerName}
                  name={markerName.replace("marker_positive_", "") as keyof ChannelsStateColumns}
                  color={color}
                  isVisible={isVisible}
                  isLoading={false}
                  pixelValue={count}
                  maxDomain={maxDomain}
                  toggleChannelVisibility={() =>
                    setMarkerVisibility(resourceId, markerName, !isVisible)
                  }
                  onColorChange={(color) => setMarkerColor(resourceId, markerName, color)}
                />
              );
            })
          ) : (
            <div className="p-4 text-sm text-muted-foreground">
              No markers found in this overlay
            </div>
          )}
        </RadioGroup>
      )}
    </div>
  );
};
