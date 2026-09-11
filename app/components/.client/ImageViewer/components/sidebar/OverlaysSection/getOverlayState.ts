import { categoricalColorAt } from "../../../categoricalColors";
import { OverlayState } from "../../../state/store/types";
import type { OverlayConfig } from "~/utils/db/overlayConfig";

export type MarkerInfo = Record<string, { count: number }>;

const MARKER_POSITIVE_PREFIX = "marker_positive_";

/** Display label for a marker: config label wins, else the prefix-stripped key. */
export function markerDisplayLabel(markerKey: string, config?: OverlayConfig | null): string {
  const cls = config?.classes.find((c) => c.sourceColumn === markerKey);
  if (cls?.label) return cls.label;
  return markerKey.startsWith(MARKER_POSITIVE_PREFIX)
    ? markerKey.slice(MARKER_POSITIVE_PREFIX.length)
    : markerKey;
}

export function getOverlayState(
  markerInfo: MarkerInfo,
  config?: OverlayConfig | null,
): OverlayState {
  const columnNames = Object.keys(markerInfo);
  const overlayState = columnNames.reduce((acc, name, index) => {
    acc[name] = {
      color: categoricalColorAt(index),
      count: markerInfo[name].count ?? 0,
      isVisible: false,
      label: markerDisplayLabel(name, config),
    };
    return acc;
  }, {} as OverlayState);

  return overlayState;
}
