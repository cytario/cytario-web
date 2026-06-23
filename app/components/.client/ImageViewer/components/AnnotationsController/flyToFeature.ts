import type { Geometry, Position } from "geojson";

import { ViewState } from "../../state/store/types";
import {
  calculateViewStateToFitBounds,
  type Bounds,
} from "../Measurements/calculateViewStateToFitBounds";

/** Collects every position from a (possibly nested) coordinate array. */
const collectPositions = (coords: unknown, out: Position[]): void => {
  if (!Array.isArray(coords)) return;
  if (typeof coords[0] === "number") {
    out.push(coords as Position);
  } else {
    coords.forEach((child) => collectPositions(child, out));
  }
};

/** Pixel-space bounds of a GeoJSON geometry, or null if it has no coordinates. */
const geometryBounds = (geometry: Geometry): Bounds | null => {
  if (!("coordinates" in geometry)) return null; // GeometryCollection — not emitted by draw modes
  const positions: Position[] = [];
  collectPositions(geometry.coordinates, positions);
  if (positions.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of positions) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return [minX, minY, maxX, maxY];
};

/** View state that frames `geometry` in the current viewport, or null if the
 *  geometry has no bounds. Reuses the shared zoom-to-fit math.
 *
 *  The `base` is built as a clean literal (mirroring `calculateViewStateToFit`),
 *  NOT spread from `current` — `current` is whatever deck last emitted via
 *  `onViewStateChange` and carries controller/transition internals that, when
 *  fed back through the controlled `viewState` prop, shadow the zoom update. */
export const flyToFeatureViewState = (geometry: Geometry, current: ViewState): ViewState | null => {
  const bounds = geometryBounds(geometry);
  if (!bounds) return null;

  const base: ViewState = {
    width: current.width,
    height: current.height,
    rotationX: 0,
    rotationOrbit: 0,
    target: [0, 0],
    zoom: 0,
    minRotationX: -90,
    maxRotationX: 90,
    minZoom: -10,
    maxZoom: 10,
    transitionDuration: 0,
  };

  return calculateViewStateToFitBounds(bounds, { width: base.width, height: base.height }, base);
};
