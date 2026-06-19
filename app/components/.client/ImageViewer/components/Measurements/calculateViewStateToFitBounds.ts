import { ViewPort, ViewState } from "../../state/store/types";

/** Pixel-space bounding box: `[minX, minY, maxX, maxY]`. */
export type Bounds = [number, number, number, number];

interface CalculateViewStateToFitBoundsOptions {
  /** Viewport margin in px kept clear around the bounds. */
  padding?: number;
  /** Fraction of the available viewport the bounds should fill (breathing room). */
  fitFraction?: number;
}

/**
 * Fits a pixel-space bounding box into the viewport, reusing the same viv zoom
 * model as {@link calculateViewStateToFit} (`zoom = log2(scale)`, target =
 * bbox center). Inherits rotation/clamps/dimensions from `base`; overrides only
 * `target` + `zoom`. The store's `setViewStateActive` re-clamps zoom, so tiny
 * bounds (e.g. a point) settle at `maxZoom` rather than an absurd value.
 */
export function calculateViewStateToFitBounds(
  bounds: Bounds,
  viewport: ViewPort,
  base: ViewState,
  options?: CalculateViewStateToFitBoundsOptions,
): ViewState {
  const [minX, minY, maxX, maxY] = bounds;
  const padding = options?.padding ?? 48;
  const fitFraction = options?.fitFraction ?? 0.9;

  const adjustedWidth = Math.max(viewport.width - 2 * padding, 1);
  const adjustedHeight = Math.max(viewport.height - 2 * padding, 1);

  // `|| 1` guards a zero-size bbox (a point); zoom then clamps to maxZoom.
  const boundsWidth = maxX - minX || 1;
  const boundsHeight = maxY - minY || 1;

  const scale = Math.min(adjustedWidth / boundsWidth, adjustedHeight / boundsHeight) * fitFraction;

  return {
    ...base,
    target: [(minX + maxX) / 2, (minY + maxY) / 2],
    zoom: Math.log2(scale),
    transitionDuration: 0,
  };
}
