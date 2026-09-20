import { OverlaysState, OverlayState, RGBA } from "../../../state/store/types";
import { CATEGORICAL_COLORS } from "../SectionRow/ColorPicker/utils";
import { type OverlayConfig, MARKER_POSITIVE_PREFIX } from "~/utils/db/overlayConfig";

export type MarkerInfo = Record<string, { count: number }>;

/** The palette color for a marker index, cycling once exhausted. */
const categoricalColorAt = (index: number): RGBA =>
  CATEGORICAL_COLORS[index % CATEGORICAL_COLORS.length];

/** Markers held by overlays other than {@link resourceId}, shifted past so the
 *  same marker loaded from two files starts life on distinct palette colors. */
export function paletteOffsetFor(overlays: OverlaysState, resourceId: string): number {
  return Object.entries(overlays)
    .filter(([id]) => id !== resourceId)
    .reduce((offset, [, entry]) => offset + Object.keys(entry.markers).length, 0);
}

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
  paletteOffset = 0,
): OverlayState {
  const columnNames = Object.keys(markerInfo);
  const overlayState = columnNames.reduce((acc, name, index) => {
    acc[name] = {
      color: categoricalColorAt(index + paletteOffset),
      count: markerInfo[name].count ?? 0,
      isVisible: false,
      label: markerDisplayLabel(name, config),
    };
    return acc;
  }, {} as OverlayState);

  return overlayState;
}
