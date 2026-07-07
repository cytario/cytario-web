import { categoricalColorAt } from "../../categoricalColors";
import { OverlayState } from "../../state/store/types";

export type MarkerInfo = Record<string, { count: number }>;

export function getOverlayState(markerInfo: MarkerInfo): OverlayState {
  const columnNames = Object.keys(markerInfo);
  const overlayState = columnNames.reduce((acc, name, index) => {
    acc[name] = {
      color: categoricalColorAt(index),
      count: markerInfo[name].count ?? 0,
      isVisible: false,
    };
    return acc;
  }, {} as OverlayState);

  return overlayState;
}
