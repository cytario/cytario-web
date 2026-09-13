import { Badge, Banner, Link, MenuItem, Switch, Tooltip, useToast } from "@cytario/design";
import { useEffect, useMemo, useState } from "react";

import { getOverlayState } from "./getOverlayState";
import { OverlayConfigModal } from "./OverlayConfig.modal";
import { select } from "../../../state/store/selectors";
import { type OverlayEntry } from "../../../state/store/types";
import { useViewerStore } from "../../../state/store/ViewerStoreContext";
import { ColorPicker, rgb } from "../ChannelsSection/ColorPicker/ColorPicker";
import { ControlRow } from "../ControlRow";
import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { NodeLink } from "~/components/DirectoryView/NodeLink/NodeLink";
import { LoaderView } from "~/components/Loader/LoaderView";
import { select as connectionsSelect } from "~/utils/connectionsStore/selectors";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { getMarkerInfoWasm, getOverlayCellCount } from "~/utils/db/getMarkerInfoWasm";
import { MARKER_POSITIVE_PREFIX } from "~/utils/db/overlayConfig";
import { useFileStore } from "~/utils/localFilesStore/useFileStore";
import { parseResourceId } from "~/utils/resourceId";

interface OverlayItemProps {
  resourceId: string;
  overlay: OverlayEntry;
}

export const OverlayItem = ({ resourceId, overlay }: OverlayItemProps) => {
  const setMarkerVisibility = useViewerStore(select.setMarkerVisibility);
  const setMarkerColor = useViewerStore(select.setMarkerColor);
  const removeOverlaysState = useViewerStore(select.removeOverlaysState);
  const updateOverlaysState = useViewerStore(select.updateOverlaysState);
  const { toast } = useToast();

  // Get file download progress from the file store
  const fileProgress = useFileStore((state) => state.files[resourceId]?.progress);

  const [isOpen, setIsOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [cellCount, setCellCount] = useState<number | null>(null);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  const overlayState = overlay.markers;
  const { connectionId, pathName, fileName } = parseResourceId(resourceId);
  const markerEntries = Object.entries(overlayState);
  const hasMarkers = markerEntries.length > 0;
  const anyMarkerVisible = markerEntries.some(([, m]) => m.isVisible);

  // File-level visibility: flip every marker in the file at once.
  const setFileVisible = (visible: boolean) =>
    updateOverlaysState(
      resourceId,
      Object.fromEntries(markerEntries.map(([name, m]) => [name, { ...m, isVisible: visible }])),
    );

  // The overlay file as a TreeNode, so the file row renders as the shared
  // NodeLink (icon + name + context menu) used across the directory views.
  const node = useMemo<TreeNode>(
    () => ({
      id: resourceId,
      connectionId,
      connectionName: "",
      pathName,
      name: fileName,
      type: "file",
      isLeaf: true,
    }),
    [resourceId, connectionId, pathName, fileName],
  );

  // Calculate maxDomain from actual marker counts (for progress bar scaling)
  const maxDomain = Math.max(
    ...Object.values(overlayState).map(({ count }) => count),
    1, // Prevent division by zero
  );

  const connectionConfig = useConnectionsStore(connectionsSelect.connectionConfig(connectionId));

  // Fetch markers on mount if not already loaded
  useEffect(() => {
    if (hasMarkers || !connectionConfig) return;

    const fetchMarkers = async () => {
      setIsLoading(true);
      try {
        const markerInfo = await getMarkerInfoWasm(resourceId, overlay.config);
        if (markerInfo && Object.keys(markerInfo).length > 0) {
          const newOverlayState = getOverlayState(markerInfo, overlay.config);
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
    connectionConfig,
    updateOverlaysState,
    toast,
    fileName,
    overlay.config,
  ]);

  // Total cell/object count for the file-level badge (rows in the parquet).
  useEffect(() => {
    if (!connectionConfig) return;
    let cancelled = false;
    getOverlayCellCount(resourceId)
      .then((n) => !cancelled && setCellCount(n))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [resourceId, connectionConfig]);

  const openConfig = () => {
    setConfigError(null);
    setIsConfigOpen(true);
  };

  return (
    <div className="flex flex-col">
      {/* File row: clicking the name toggles the marker list; navigation,
          reconfiguration and removal live in the node's context menu. */}
      <div className="flex items-center gap-2 p-2">
        <NodeLink
          node={node}
          onClick={() => setIsOpen(!isOpen)}
          contextMenuItems={
            <>
              <MenuItem id="configure-overlay" icon="Settings" onAction={openConfig}>
                Configure
              </MenuItem>
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
            </>
          }
        />
        {cellCount != null && <Badge>{cellCount}</Badge>}
        {hasMarkers && (
          <Switch
            isSelected={anyMarkerVisible}
            onChange={(visible) => setFileVisible(visible)}
            aria-label={`Toggle ${fileName} markers visibility`}
          />
        )}
      </div>

      {(configError || (!overlay.config && !hasMarkers && !isLoading)) && (
        <div className="px-2 pb-2">
          <Banner variant="warning" title={`Could not load ${fileName}`}>
            {configError ??
              "The column layout could not be interpreted automatically — no markers loaded."}{" "}
            <Link onPress={openConfig}>Configure</Link>
          </Banner>
        </div>
      )}

      {/* Body: one ControlRow per marker. A labeled group (not radio semantics —
          markers have no selected-item concept) names the marker list for
          assistive tech and scopes it for tests. */}
      {isOpen && (
        <div role="group" aria-label="Overlay markers" className="flex flex-col gap-2 px-2">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center gap-2 p-4">
              <LoaderView label="Loading markers…" />

              {fileProgress && fileProgress.percentage < 100 && (
                <div className="text-sm">Downloading: {Math.round(fileProgress.percentage)}%</div>
              )}
            </div>
          ) : hasMarkers ? (
            Object.entries(overlayState).map(([markerName, { color, count, isVisible, label }]) => {
              const name =
                label ??
                (markerName.startsWith(MARKER_POSITIVE_PREFIX)
                  ? markerName.slice(MARKER_POSITIVE_PREFIX.length)
                  : markerName);
              return (
                <ControlRow
                  key={markerName}
                  className={isVisible ? "text-foreground" : "text-muted-foreground"}
                  accessory={
                    <div className="absolute bottom-0 left-0 right-0 h-0.5">
                      {isVisible && (
                        <div
                          className="h-full"
                          style={{
                            width: `${(count / maxDomain) * 100}%`,
                            backgroundColor: rgb(color),
                          }}
                        />
                      )}
                    </div>
                  }
                  swatch={
                    // Picker is RGB; the marker color keeps its alpha across a recolor.
                    <ColorPicker
                      color={[color[0], color[1], color[2]]}
                      onColorChange={(c) =>
                        setMarkerColor(resourceId, markerName, [...c, color[3]])
                      }
                    />
                  }
                  title={name}
                  count={count > 0 ? count : undefined}
                  toggle={
                    <Tooltip content={`${isVisible ? "Hide" : "Show"} ${name}`}>
                      <Switch
                        isSelected={isVisible}
                        onChange={() => setMarkerVisibility(resourceId, markerName, !isVisible)}
                        color={rgb(color)}
                        aria-label={`Toggle ${name} visibility`}
                      />
                    </Tooltip>
                  }
                />
              );
            })
          ) : (
            <div className="p-4 text-sm text-muted-foreground">
              No markers found in this overlay
            </div>
          )}
        </div>
      )}

      {isConfigOpen && (
        <OverlayConfigModal
          resourceId={resourceId}
          overlay={overlay}
          onClose={() => setIsConfigOpen(false)}
          onApplyError={(message) => setConfigError(message)}
        />
      )}
    </div>
  );
};
