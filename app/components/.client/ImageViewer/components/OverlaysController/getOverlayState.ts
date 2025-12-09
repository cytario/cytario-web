import { RGBA, OverlayState } from "../../state/types";

export type MarkerInfo = Record<string, { count: number }>;

// 8 visually distinct colors (matches shader capacity)
export const OVERLAY_COLORS: RGBA[] = [
  [255, 0, 0, 255], // Red
  [255, 128, 0, 255], // Orange
  [255, 255, 0, 255], // Yellow
  [0, 255, 0, 255], // Green
  [0, 255, 255, 255], // Cyan
  [0, 0, 255, 255], // Blue
  [128, 0, 255, 255], // Violet
  [255, 0, 255, 255], // Magenta
];

function getFillColor(index: number): RGBA {
  return OVERLAY_COLORS[index % OVERLAY_COLORS.length];
}

export function getOverlayState(markerInfo: MarkerInfo): OverlayState {
  const columnNames = Object.keys(markerInfo);
  const overlayState = columnNames.reduce((acc, name, index) => {
    acc[name] = {
      color: getFillColor(index),
      count: markerInfo[name].count ?? 0,
      isVisible: false,
    };
    return acc;
  }, {} as OverlayState);

  return overlayState;
}
