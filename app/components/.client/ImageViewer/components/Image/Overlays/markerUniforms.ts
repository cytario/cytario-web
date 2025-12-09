import type { ShaderModule } from "@luma.gl/shadertools";

import { RGBA } from "../../../state/types";

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
  getMarkerMask?: (
    d: unknown,
    info: { index: number; data: unknown; target: unknown[] }
  ) => number; // Returns a 32-bit bitmask
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
 * Create MarkerProps from fileMarkers record
 */
export function createMarkerProps(
  fileMarkers: Record<string, { color: RGBA }>,
  opacity: number
): MarkerProps {
  const keys = Object.keys(fileMarkers);
  const getColor = (i: number): RGBA => {
    const c = fileMarkers[keys[i]]?.color ?? [0, 0, 0, 0];
    return [c[0], c[1], c[2], 1.0];
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
