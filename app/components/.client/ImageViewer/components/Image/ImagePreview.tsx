import { PickingInfo } from "@deck.gl/core";
import { DeckGL } from "@deck.gl/react";
import { useCallback, useEffect } from "react";

import { useChannelsLayer } from "./Channels/useChannelsLayer";
import { ImageContainer } from "./ImageContainer";
import { useOverlaysLayers } from "./Overlays/useOverlaysLayer";
import { useInitializeChannels } from "./useInitializeChannels";
import { useView } from "./useView";
import { registerDecoders } from "../../state/decoders/registerDecoders";
import { select } from "../../state/store/selectors";
import { ViewPort } from "../../state/store/types";
import { useViewerStore } from "../../state/store/ViewerStoreContext";
import { ActiveViewStatePreview } from "../Measurements/ActiveViewStatePreview";
import { calculateViewStateToFit } from "../Measurements/calculateViewStateToFit";

// Register geotiff decoders so dashboard thumbnails and the full viewer
// can decode the same set of TIFF compression methods.
registerDecoders();

interface ViewProps {
  viewPort: ViewPort;
  padding?: number;
  isInteractive: boolean;
}

const ImagePreviewInner = ({ viewPort, isInteractive }: ViewProps) => {
  const metadata = useViewerStore(select.metadata);
  const viewStatePreview = useViewerStore(select.viewStatePreview);

  const setViewStatePreview = useViewerStore(select.setViewStatePreview);

  const viewStateActive = useViewerStore(select.viewStateActive);
  const setViewStateActive = useViewerStore(select.setViewStateActive);

  useInitializeChannels(viewPort);

  /* Reset `viewStatePreview` upon container resize */
  useEffect(() => {
    if (metadata) {
      const initialViewState = calculateViewStateToFit(metadata, viewPort);
      setViewStatePreview(initialViewState);
    }
  }, [metadata, setViewStatePreview, viewPort]);

  const view = useView(viewPort);

  const activeImagePanelId = useViewerStore(select.activeImagePanelId);
  const multiscaleLayer = useChannelsLayer(activeImagePanelId);
  const markersLayers = useOverlaysLayers(activeImagePanelId);

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

  const getCursor = useCallback(
    ({ isDragging }: { isHovering: boolean; isDragging: boolean }) => {
      if (!isInteractive) return "inherit";
      if (isDragging) return "grabbing";
      return "grab";
    },
    [isInteractive],
  );

  if (!viewStatePreview) {
    return null;
  }

  return (
    <DeckGL
      width={viewPort.width}
      height={viewPort.height}
      views={[view]}
      layers={[multiscaleLayer, ...markersLayers]}
      viewState={{ detail: viewStatePreview }}
      getCursor={getCursor}
      onClick={setViewState}
      onDrag={setViewState}
    />
  );
};

export const ImagePreview = ({
  isInteractive = false,
}: {
  isInteractive?: boolean;
}) => {
  return (
    <ImageContainer isPreview>
      {(viewPort) => (
        <>
          <ImagePreviewInner
            viewPort={viewPort}
            isInteractive={isInteractive}
          />
          <ActiveViewStatePreview />
        </>
      )}
    </ImageContainer>
  );
};
