import type { ViewState } from "../../state/store/types";
import {
  Bounds,
  calculateViewStateToFitBounds,
} from "../canvas/Measurements/calculateViewStateToFitBounds";

/** Margin around an annotation-region framing, as a fraction of each axis. */
export const REGION_MARGIN = 0.02;

export interface FramedExtent {
  /** View state (zoom, target) that fills the viewport with the framed extent. */
  viewState: ViewState;
  /** Level-0 pixel extent the frame covers — the native-resolution budget. */
  level0Width: number;
  level0Height: number;
}

/** Frames the current view: the capture renders exactly the on-screen extent,
 *  so zoom is lifted by log2(scale) to put that many pixels in the buffer. */
export const frameCurrentView = (viewStateActive: ViewState, scale: number): FramedExtent => ({
  viewState: {
    ...viewStateActive,
    zoom: viewStateActive.zoom + Math.log2(scale),
  },
  level0Width: viewStateActive.width * 2 ** -viewStateActive.zoom,
  level0Height: viewStateActive.height * 2 ** -viewStateActive.zoom,
});

/** Frames a region's level-0 bounds with the shared margin — the fit maps
 *  the margin-expanded region onto the viewport, so the covered extent (the
 *  viewport at the fitted zoom, expanded to its own aspect) is the framed
 *  extent the capture renders and the native-resolution budget. */
export const frameRegion = (
  viewStateActive: ViewState,
  bounds: Bounds,
  scale: number,
): FramedExtent => {
  const fitFraction = 1 / (1 + 2 * REGION_MARGIN);
  const bufferWidth = viewStateActive.width * scale;
  const bufferHeight = viewStateActive.height * scale;
  const viewState = calculateViewStateToFitBounds(
    bounds,
    { width: bufferWidth, height: bufferHeight },
    viewStateActive,
    { padding: 0, fitFraction },
  );

  const level0Width = bufferWidth / 2 ** viewState.zoom;
  const level0Height = bufferHeight / 2 ** viewState.zoom;
  return { viewState, level0Width, level0Height };
};
