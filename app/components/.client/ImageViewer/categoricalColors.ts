import { RGBA } from "./state/store/types";

/**
 * The viewer's shared categorical palette: 8 visually distinct colors (matches
 * the overlay shader's channel capacity) cycled by index for overlay markers,
 * channel fallbacks, annotation classes, and the color-picker presets.
 * Migrating these to cytario-design tokens is tracked in C-320.
 */
export const CATEGORICAL_COLORS: RGBA[] = [
  [255, 0, 0, 255], // Red
  [255, 128, 0, 255], // Orange
  [255, 255, 0, 255], // Yellow
  [0, 255, 0, 255], // Green
  [0, 255, 255, 255], // Cyan
  [0, 0, 255, 255], // Blue
  [128, 0, 255, 255], // Violet
  [255, 0, 255, 255], // Magenta
];

/** The palette color for an index, cycling once exhausted. */
export const categoricalColorAt = (index: number): RGBA =>
  CATEGORICAL_COLORS[index % CATEGORICAL_COLORS.length];
