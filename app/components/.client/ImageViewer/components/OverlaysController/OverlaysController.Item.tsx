import {
  IconButton,
  IconButtonLink,
  useToast,
} from "@cytario/design";
import { ExternalLink, X } from "lucide-react";
import { useEffect, useState } from "react";
import { RadioGroup } from "react-aria-components";
import { twMerge } from "tailwind-merge";

import { getOverlayState } from "./getOverlayState";
import { select } from "../../state/store/selectors";
import { ChannelsStateColumns, OverlayState } from "../../state/store/types";
import { useViewerStore } from "../../state/store/ViewerStoreContext";
import { ChannelsControllerItem } from "../ChannelsController/ChannelsControllerItem";
import { LavaLoader } from "~/components/LavaLoader";
import { useConnectionsStore, selectConnection } from "~/utils/connectionsStore";
import { getMarkerInfoWasm } from "~/utils/db/getMarkerInfoWasm";
import { useFileStore } from "~/utils/localFilesStore/useFileStore";
import { getFileName, parseResourceId } from "~/utils/resourceId";

interface OverlaysControllerItemProps {
  resourceId: string;
  overlayState: OverlayState;
}

export const OverlaysControllerItem = ({
  resourceId,
  overlayState,
}: OverlaysControllerItemProps) => {
  const setMarkerVisibility = useViewerStore(select.setMarkerVisibility);
  const setMarkerColor = useViewerStore(select.setMarkerColor);
  const removeOverlaysState = useViewerStore(select.removeOverlaysState);
  const updateOverlaysState = useViewerStore(select.updateOverlaysState);
  const { toast } = useToast();

  // Get file download progress from the file store
  const fileProgress = useFileStore(
    (state) => state.files[resourceId]?.progress,
  );

  const cx = twMerge(
    "flex flex-col px-3",
  );

  const [isOpen, setIsOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const fileName = getFileName(resourceId);
  const hasMarkers = Object.keys(overlayState).length > 0;

  // Calculate maxDomain from actual marker counts (for progress bar scaling)
  const maxDomain = Math.max(
    ...Object.values(overlayState).map(({ count }) => count),
    1, // Prevent division by zero
  );

  const { connectionName } = parseResourceId(resourceId);
  const connection = useConnectionsStore(selectConnection(connectionName));

  // Fetch markers on mount if not already loaded
  useEffect(() => {
    if (hasMarkers || !connection) return;

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
  }, [
    hasMarkers,
    resourceId,
    connection,
    updateOverlaysState,
    toast,
    fileName,
  ]);

  return (
    <div className="flex flex-col">
      {/* File info row */}
      <div className="flex items-center gap-1.5 px-3 pt-2">
        <button
          type="button"
          className="flex-1 min-w-0 truncate rounded border border-[var(--color-border-default)] bg-[var(--color-surface-subtle)] px-2 py-1 text-xs text-[var(--color-text-primary)] text-left"
          onClick={() => setIsOpen(!isOpen)}
        >
          {fileName}
        </button>

        <IconButtonLink
          href={`/connections/${resourceId}`}
          icon={ExternalLink}
          aria-label="Open file"
          variant="ghost"
          size="sm"
        />

        <IconButton
          icon={X}
          aria-label="Remove overlay"
          variant="ghost"
          size="sm"
          onPress={() => {
            const confirmation = confirm(
              `Are you sure you want to remove overlay "${fileName}"?`,
            );
            if (confirmation) removeOverlaysState(resourceId);
          }}
        />
      </div>

      {/* Body */}
      {isOpen && (
        <RadioGroup aria-label="Overlay markers" className={cx}>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-2 p-4">
              <LavaLoader />
              {fileProgress && fileProgress.percentage < 100 && (
                <div className="text-sm">
                  Downloading: {Math.round(fileProgress.percentage)}%
                </div>
              )}
            </div>
          ) : hasMarkers ? (
            Object.entries(overlayState).map(
              ([markerName, { color, count, isVisible }]) => {
                return (
                  <ChannelsControllerItem
                    key={markerName}
                    name={
                      markerName.replace(
                        "marker_positive_",
                        "",
                      ) as keyof ChannelsStateColumns
                    }
                    color={color}
                    isVisible={isVisible}
                    isLoading={false}
                    pixelValue={count}
                    maxDomain={maxDomain}
                    toggleChannelVisibility={() =>
                      setMarkerVisibility(resourceId, markerName, !isVisible)
                    }
                    onColorChange={(color) =>
                      setMarkerColor(resourceId, markerName, color)
                    }
                  />
                );
              },
            )
          ) : (
            <div className="p-4 text-sm text-[var(--color-text-secondary)]">
              No markers found in this overlay
            </div>
          )}
        </RadioGroup>
      )}
    </div>
  );
};
