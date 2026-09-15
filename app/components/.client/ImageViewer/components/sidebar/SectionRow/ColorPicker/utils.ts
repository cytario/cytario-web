import { RGBA } from "../../../../state/store/types";

/** Shared categorical palette, cycled by index for overlay markers, channels, classes, and picker presets. */
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
