import type { ShaderModule } from "@luma.gl/shadertools";

import { RGBA } from "../../../state/store/types";

// GLSL uniform block declaration for marker colors and opacity
const uniformBlock = /* glsl */ `\
  uniform markerUniforms {
    vec4 color0;
    vec4 color1;
    vec4 color2;
    vec4 color3;
    vec4 color4;
    vec4 color5;
    vec4 color6;
    vec4 color7;
    float opacity;
  } marker;
`;

// TypeScript type for marker color props
export type MarkerProps = {
  color0: RGBA;
  color1: RGBA;
  color2: RGBA;
  color3: RGBA;
  color4: RGBA;
  color5: RGBA;
  color6: RGBA;
  color7: RGBA;
  opacity: number;
};

export interface MarkerLayerProps {
  markerProps?: MarkerProps;
  getMarkerMask?: (d: unknown, info: { index: number; data: unknown; target: unknown[] }) => number; // Returns a 32-bit bitmask
}

// Export the ShaderModule with uniform types
export const markerUniforms = {
  name: "marker",
  vs: "", // Not needed in vertex shader
  fs: uniformBlock, // Add to fragment shader
  uniformTypes: {
    color0: "vec4<f32>",
    color1: "vec4<f32>",
    color2: "vec4<f32>",
    color3: "vec4<f32>",
    color4: "vec4<f32>",
    color5: "vec4<f32>",
    color6: "vec4<f32>",
    color7: "vec4<f32>",
    opacity: "f32",
  },
} as const satisfies ShaderModule<MarkerProps>;

/**
 * Create MarkerProps from fileMarkers record.
 *
 * The shader supports 32 marker bits but only 8 color slots (the bit-to-color
 * mapping is `i % 8` in the fragment shader). Multiple markers can therefore
 * collide on a single slot; the OverlaysPanel exposes a per-marker color
 * picker that lets the user override any individual marker's color.
 *
 * Slot assignment is FIRST-wins: slot `s` takes its color from
 * `fileMarkers[keys[s]]` (the lowest-indexed marker that maps to that slot).
 * Last-wins (the previous behaviour) caused C-180: editing the colour of any
 * marker with index < 8 had no visible effect once a higher-indexed marker
 * shared its slot, because the higher index silently overwrote the slot on
 * every recompute. Markers at indices 8+ still cycle through the same eight
 * colour slots — a fundamental limit of the 8-slot shader uniform — so they
 * render in the colour of their cycle partner.
 */
export function createMarkerProps(
  fileMarkers: Record<string, { color: RGBA }>,
  opacity: number,
): MarkerProps {
  const keys = Object.keys(fileMarkers);

  const getColor = (slot: number): RGBA => {
    const c = fileMarkers[keys[slot]]?.color;
    return c ? [c[0], c[1], c[2], 1.0] : [0, 0, 0, 0];
  };

  return {
    color0: getColor(0),
    color1: getColor(1),
    color2: getColor(2),
    color3: getColor(3),
    color4: getColor(4),
    color5: getColor(5),
    color6: getColor(6),
    color7: getColor(7),
    opacity,
  };
}
