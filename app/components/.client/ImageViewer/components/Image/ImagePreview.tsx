import { PickingInfo } from "@deck.gl/core";
import { DeckGL } from "@deck.gl/react";
import { useCallback, useEffect } from "react";

import { useChannelsLayer } from "./Channels/useChannelsLayer";
import { ImageContainer } from "./ImageContainer";
import { useOverlaysLayers } from "./Overlays/useOverlaysLayer";
import { useInitializeChannels } from "./useInitializeChannels";
import { useView } from "./useView";
import { select } from "../../state/selectors";
import { ViewPort } from "../../state/types";
import { useViewerStore } from "../../state/ViewerStoreContext";
import { ActiveViewStatePreview } from "../Measurements/ActiveViewStatePreview";
import { calculateViewStateToFit } from "../Measurements/calculateViewStateToFit";

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
    const { width: wP, height: hP } = viewPort;
    const { width: wS, height: hS } = viewStatePreview ?? {
      width: 0,
      height: 0,
    };
    if (metadata && (wP !== wS || hP !== hS)) {
      const initialViewState = calculateViewStateToFit(metadata, viewPort);
      setViewStatePreview(initialViewState);
    }
  }, [metadata, setViewStatePreview, viewPort, viewStatePreview]);

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
