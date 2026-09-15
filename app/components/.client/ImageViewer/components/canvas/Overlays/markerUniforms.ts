import type { ShaderModule } from "@luma.gl/shadertools";

import { RGBA } from "../../../state/store/types";

// One color slot per marker bit (32), so each marker keeps an independent color.
const COLOR_SLOT_COUNT = 32;

type Enumerate<N extends number, Acc extends number[] = []> = Acc["length"] extends N
  ? Acc[number]
  : Enumerate<N, [...Acc, Acc["length"]]>;

type ColorSlot = `color${Enumerate<typeof COLOR_SLOT_COUNT>}`;

const colorSlotNames = Array.from(
  { length: COLOR_SLOT_COUNT },
  (_, i) => `color${i}`,
) as ColorSlot[];

const colorUniformTypes = Object.fromEntries(
  colorSlotNames.map((name) => [name, "vec4<f32>"]),
) as Record<ColorSlot, "vec4<f32>">;

// GLSL uniform block declaration for marker colors and opacity
const uniformBlock = /* glsl */ `\
  uniform markerUniforms {
${colorSlotNames.map((name) => `    vec4 ${name};`).join("\n")}
    float opacity;
  } marker;
`;

// TypeScript type for marker color props
export type MarkerProps = Record<ColorSlot, RGBA> & { opacity: number };

export interface MarkerLayerProps {
  markerProps?: MarkerProps;
  getMarkerMask?: (d: unknown, info: { index: number; data: unknown; target: unknown[] }) => number; // Returns a 32-bit bitmask
}

export const markerUniforms = {
  name: "marker",
  vs: "", // Not needed in vertex shader
  fs: uniformBlock, // Add to fragment shader
  uniformTypes: {
    ...colorUniformTypes,
    opacity: "f32",
  },
} as const satisfies ShaderModule<MarkerProps>;

/**
 * Create MarkerProps from fileMarkers record.
 *
 * Each of the 32 marker bits maps to its own color slot, so every marker keeps
 * the color it was assigned (default palette or custom hex). Markers past the
 * record's length fall back to transparent black.
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

  const props = Object.fromEntries(
    colorSlotNames.map((name, slot) => [name, getColor(slot)]),
  ) as Record<ColorSlot, RGBA>;

  return { ...props, opacity };
}

/**
 * Blend the active slot colors from a {@link MarkerProps} + bitmask,
 * mirroring the GLSL additive blend in `additiveBlending.glsl.ts`:
 * bit `i` → its own slot, summed per channel, clamped to [0, 255].
 * Returns `[r, g, b, 255]` (opaque) or `[0, 0, 0, 0]` when no bits are set.
 */
export function blendMarkerColor(props: MarkerProps, bitmask: number): RGBA {
  if (bitmask === 0) return [0, 0, 0, 0];
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < COLOR_SLOT_COUNT; i++) {
    if (bitmask & (1 << i)) {
      const c = props[colorSlotNames[i]];
      r += c[0];
      g += c[1];
      b += c[2];
    }
  }
  return [Math.min(r, 255), Math.min(g, 255), Math.min(b, 255), 255];
}
