import { PickingInfo } from "@deck.gl/core";
import { DeckGL } from "@deck.gl/react";
import { useCallback, useEffect } from "react";

import { useAnnotationsLayer } from "./Annotations/useAnnotationsLayer";
import { useChannelsLayer } from "./Channels/useChannelsLayer";
import { ImageContainer } from "./ImageContainer";
import { ActiveViewStatePreview } from "./Measurements/ActiveViewStatePreview";
import { calculateViewStateToFit } from "./Measurements/calculateViewStateToFit";
import { useOverlaysLayers } from "./Overlays/useOverlaysLayer";
import { useInitializeChannels } from "./useInitializeChannels";
import { useView } from "./useView";
import { registerDecoders } from "../../state/decoders/registerDecoders";
import { select } from "../../state/store/selectors";
import { ViewPort } from "../../state/store/types";
import { useViewerStore } from "../../state/store/ViewerStoreContext";

// Register geotiff decoders so dashboard thumbnails and the full viewer
// can decode the same set of TIFF compression methods.
registerDecoders();

interface ViewProps {
  viewPort: ViewPort;
  padding?: number;
  isInteractive: boolean;
}

/**
 * Read-only DeckGL preview of the active image. Used in two contexts:
 * - Dashboard grid thumbnails (`isInteractive = false`) — no click handling.
 * - Slide view side panel (`isInteractive = true`) — clicking navigates the
 *   active viewport to the clicked coordinate.
 *
 * Shares the same channel, overlay, and annotation layer hooks as the main
 * {@link ImagePanel}, but without hover/tooltip or interactive annotation
 * editing. The deck.gl `controller` is intentionally omitted so the preview
 * cannot be panned/zoomed.
 */
const ImagePreviewInner = ({ viewPort, isInteractive }: ViewProps) => {
  const metadata = useViewerStore(select.metadata);
  const viewStatePreview = useViewerStore(select.viewStatePreview);

  const setViewStatePreview = useViewerStore(select.setViewStatePreview);

  const viewStateActive = useViewerStore(select.viewStateActive);
  const setViewStateActive = useViewerStore(select.setViewStateActive);

  useInitializeChannels();

  // Recompute the preview viewport whenever the container is resized.
  useEffect(() => {
    if (metadata) {
      const initialViewState = calculateViewStateToFit(metadata, viewPort);
      setViewStatePreview(initialViewState);
    }
  }, [metadata, setViewStatePreview, viewPort]);

  const view = useView(viewPort);

  const activeImagePanelId = useViewerStore(select.activeImagePanelId);
  const channelsResult = useChannelsLayer(activeImagePanelId);
  const overlaysResult = useOverlaysLayers(activeImagePanelId);
  // Read-only: annotations render in the preview but are not editable.
  const annotationsResult = useAnnotationsLayer(activeImagePanelId, false);

  // Click handler: when interactive, pan the active viewport to the clicked coordinate.
  const setViewState = useCallback(
    ({ coordinate }: PickingInfo) => {
      if (isInteractive && viewStateActive && coordinate) {
        setViewStateActive({
          ...viewStateActive,
          target: coordinate as [number, number],
        });
      }
    },
    [isInteractive, viewStateActive, setViewStateActive],
  );

  if (!viewStatePreview) {
    return null;
  }

  return (
    <DeckGL
      width={viewPort.width}
      height={viewPort.height}
      views={[view]}
      layers={[...channelsResult.layers, ...overlaysResult.layers, ...annotationsResult.layers]}
      viewState={{ detail: viewStatePreview }}
      onClick={setViewState}
      onDrag={setViewState}
    />
  );
};

/**
 * Wrapper that provides a sized container for the DeckGL preview and overlays
 * the active-viewport indicator. Renders nothing until the container measures
 * a non-zero viewport (handled by {@link ImageContainer}).
 *
 * @param isInteractive - When `true`, clicks navigate the active viewport.
 *   Defaults to `false` (dashboard thumbnail mode).
 */
export const ImagePreview = ({ isInteractive = false }: { isInteractive?: boolean }) => {
  return (
    <ImageContainer isPreview>
      {(viewPort) => (
        <>
          <ImagePreviewInner viewPort={viewPort} isInteractive={isInteractive} />
          <ActiveViewStatePreview />
        </>
      )}
    </ImageContainer>
  );
};
