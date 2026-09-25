import { Input, SegmentedControl, SegmentedControlItem } from "@cytario/design";

import { useViewerStore } from "../../../state/store/core/ViewerStoreContext";
import { select } from "../../../state/store/selectors";
import { DEFAULT_OBJECTIVE_POWER } from "@cytario/plugin-api";

const MAGNIFICATION_PRESETS = [1, 2, 5, 10, 20, 40, 80] as const;

export const zoomFromMagnification = (
  magnification: number,
  objectivePower: number = DEFAULT_OBJECTIVE_POWER,
): number => Math.log2(magnification / objectivePower);

export const magnificationFromZoom = (
  zoom: number,
  objectivePower: number = DEFAULT_OBJECTIVE_POWER,
): number => objectivePower * Math.pow(2, zoom);

/** Magnification presets: converts between objective zoom and magnification. */
export const Magnifier = ({
  objectivePower = DEFAULT_OBJECTIVE_POWER,
}: {
  objectivePower?: number;
}) => {
  const viewStateActive = useViewerStore(select.viewStateActive);
  const setViewStateActive = useViewerStore(select.setViewStateActive);

  const zoom = viewStateActive?.zoom ?? 0;
  const magnification = magnificationFromZoom(zoom, objectivePower);

  return (
    <div className="flex items-center gap-1 px-2 py-2">
      <Input
        isReadOnly
        value={magnification.toFixed(1)}
        size="sm"
        aria-label="Current magnification"
        className="w-16 shrink-0 text-xs text-right tabular-nums"
        suffix="x"
        align="right"
      />

      <SegmentedControl
        selectionMode="none"
        size="sm"
        aria-label="Magnification presets"
        className="flex flex-1"
      >
        {MAGNIFICATION_PRESETS.map((mag) => (
          <SegmentedControlItem
            key={mag}
            id={String(mag)}
            className="flex-1 text-xs px-1"
            onPress={() => {
              if (viewStateActive) {
                setViewStateActive({
                  ...viewStateActive,
                  zoom: zoomFromMagnification(mag, objectivePower),
                });
              }
            }}
          >
            {mag}x
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
    </div>
  );
};
