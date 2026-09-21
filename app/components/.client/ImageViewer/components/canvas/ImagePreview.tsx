import { PickingInfo } from "@deck.gl/core";
import { DeckGL } from "@deck.gl/react";
import { useCallback, useEffect } from "react";

import { useAnnotationsLayer } from "./Annotations/useAnnotationsLayer";
import { useChannelsLayer } from "./Channels/useChannelsLayer";
import { ImageContainer } from "./ImageContainer";
import { ActiveViewStatePreview } from "./Measurements/ActiveViewStatePreview";
import { calculateViewStateToFit } from "./Measurements/calculateViewStateToFit";
import { useOverlaysLayers } from "./Overlays/useOverlaysLayer";
import { useView } from "./useView";
import { registerDecoders } from "../../state/decoders/registerDecoders";
import { useViewerStore } from "../../state/store/core/ViewerStoreContext";
import { select } from "../../state/store/selectors";
import { ViewPort } from "../../state/store/types";

// Register geotiff decoders so dashboard thumbnails and the full viewer decode the
// same set of TIFF compression methods.
registerDecoders();

interface ViewProps {
  viewPort: ViewPort;
  padding?: number;
  isInteractive: boolean;
}

/** Read-only DeckGL preview of the active image, shared by dashboard thumbnails and the
 *  slide view side panel. The deck.gl `controller` is intentionally omitted so the
 *  preview cannot be panned/zoomed. */
const ImagePreviewInner = ({ viewPort, isInteractive }: ViewProps) => {
  const metadata = useViewerStore(select.metadata);
  const viewStatePreview = useViewerStore(select.viewStatePreview);

  const setViewStatePreview = useViewerStore(select.setViewStatePreview);

  const viewStateActive = useViewerStore(select.viewStateActive);
  const setViewStateActive = useViewerStore(select.setViewStateActive);

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
      // Distinct canvas id: without it the preview deck duplicates the main
      // canvas's default "deckgl-overlay" id, making that id ambiguous in the
      // DOM and in e2e selectors.
      id="image-preview-canvas"
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

/** Sizes the DeckGL preview container and overlays the active-viewport indicator; renders
 *  nothing until the container measures a non-zero viewport. */
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
