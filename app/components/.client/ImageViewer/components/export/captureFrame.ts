import { capAtNativeResolution, clampToCanvasLimits, type ExportRenderLimits } from "./clamp";
import type { ViewerStore, ViewState } from "../../state/store/types";
import type { Bounds } from "../canvas/Measurements/calculateViewStateToFitBounds";
import { physicalPixelSize } from "../canvas/Measurements/utils";

/** What a capture renders: a level-0 rectangle onto an output of `width × height` px. */
export interface CaptureFrame {
  /** The exported level-0 rectangle — the single source of truth for the extent. */
  bounds: Bounds;
  /** Output size in px; its aspect is the bounds' aspect. */
  width: number;
  height: number;
  /** The preset's size exceeded the browser's canvas limits and was shrunk. */
  clamped: boolean;
  /** The output samples finer than the scan's native resolution. */
  upscaled: boolean;
}

const boundsWidth = ([minX, , maxX]: Bounds): number => maxX - minX;
const boundsHeight = ([, minY, , maxY]: Bounds): number => maxY - minY;
const boundsCenter = ([minX, minY, maxX, maxY]: Bounds): [number, number] => [
  (minX + maxX) / 2,
  (minY + maxY) / 2,
];

/** The level-0 rectangle the viewport shows at its current zoom. */
export const currentViewBounds = ({ target: [x, y], zoom, width, height }: ViewState): Bounds => {
  const halfWidth = width / 2 ** zoom / 2;
  const halfHeight = height / 2 ** zoom / 2;
  return [x - halfWidth, y - halfHeight, x + halfWidth, y + halfHeight];
};

/** The rectangle a capture exports: exactly the selected region, or else the current view. */
export const captureBounds = (viewState: ViewState, regionBounds: Bounds | null): Bounds =>
  regionBounds ?? currentViewBounds(viewState);

/** Sizes the output for the preset's target width within the browser limits and
 *  the native-resolution cap; the bounds are snapped to the integer output size
 *  so the rendered extent is exactly `bounds`. */
export const frameCapture = (
  bounds: Bounds,
  targetWidthPx: number,
  limits: ExportRenderLimits,
): CaptureFrame => {
  const extentWidth = boundsWidth(bounds);
  const extentHeight = boundsHeight(bounds);
  const sized = clampToCanvasLimits({
    targetWidthPx,
    targetHeightPx: Math.round((targetWidthPx * extentHeight) / extentWidth),
    limits,
  });
  const capped = capAtNativeResolution(sized, { width: extentWidth, height: extentHeight });

  const width = capped.width;
  const height = Math.max(1, Math.round((width * extentHeight) / extentWidth));
  const level0PerPixel = extentWidth / width;
  const [centerX, centerY] = boundsCenter(bounds);
  const halfWidth = extentWidth / 2;
  const halfHeight = (height * level0PerPixel) / 2;
  return {
    bounds: [centerX - halfWidth, centerY - halfHeight, centerX + halfWidth, centerY + halfHeight],
    width,
    height,
    clamped: sized.clamped,
    upscaled: capped.upscaled,
  };
};

/** The view state that renders exactly `frame.bounds` onto a deck of
 *  `frame.width × frame.height` CSS px at one device pixel per CSS pixel. */
export const viewStateForFrame = (frame: CaptureFrame, base: ViewState): ViewState => ({
  ...base,
  target: boundsCenter(frame.bounds),
  zoom: Math.log2(frame.width / boundsWidth(frame.bounds)),
  width: frame.width,
  height: frame.height,
  transitionDuration: 0,
});

/** mm per level-0 pixel along X, or null when the image has no physical scale. */
export const millimetersPerLevel0Pixel = (
  metadata: NonNullable<ViewerStore["metadata"]>,
): number | null => physicalPixelSize(metadata.Pixels)?.x ?? null;

export const millimetersPerOutputPixel = (frame: CaptureFrame, millimetersPerLevel0: number) =>
  (millimetersPerLevel0 * boundsWidth(frame.bounds)) / frame.width;
