import type { Layer } from "@deck.gl/core";

const PIXEL_MINIMUMS = ["lineWidthMinPixels", "pointRadiusMinPixels", "radiusMinPixels"] as const;
const PIXEL_UNIT_SCALES = [
  ["lineWidthUnits", "lineWidthScale"],
  ["pointRadiusUnits", "pointRadiusScale"],
  ["radiusUnits", "radiusScale"],
] as const;

/** Scales a layer's screen-pixel sizes by `scale`, as a display with `scale`×
 *  pixel density would show it: pixel minimums and pixel-unit widths and radii
 *  grow, while world-unit sizes already follow the zoom. Acts on the layer's
 *  own props — composite layers such as GeoJsonLayer forward them to their
 *  sublayers. */
export const scalePixelSizes = <L extends Layer>(layer: L, scale: number): L => {
  const props = layer.props as unknown as Record<string, unknown>;
  const overrides: Record<string, number> = {};
  for (const name of PIXEL_MINIMUMS) {
    const value = props[name];
    if (typeof value === "number" && value > 0) overrides[name] = value * scale;
  }
  for (const [unitsProp, scaleProp] of PIXEL_UNIT_SCALES) {
    if (props[unitsProp] !== "pixels") continue;
    const value = props[scaleProp];
    overrides[scaleProp] = (typeof value === "number" ? value : 1) * scale;
  }
  return Object.keys(overrides).length > 0 ? (layer.clone(overrides) as L) : layer;
};
