import { Input, SegmentedControl, SegmentedControlItem } from "@cytario/design";

import { ResetViewStateButton } from "./Image/ResetViewStateButton";
import { type ViewerStore, type ViewState } from "../state/types";

const MAGNIFICATION_PRESETS = [5, 10, 20, 40, 80] as const;

export const zoomFromMagnification = (
  magnification: number,
  objectivePower = 20,
): number => Math.log2(magnification / objectivePower);

export const magnificationFromZoom = (
  zoom: number,
  objectivePower = 20,
): number => objectivePower * Math.pow(2, zoom);

export const Magnifier = ({
  metadata,
  viewStateActive,
  setViewStateActive,
}: {
  metadata: ViewerStore["metadata"] | null;
  viewStateActive: ViewState | null;
  setViewStateActive: (viewState: ViewState) => void;
}) => {
  const zoom = viewStateActive?.zoom ?? 0;
  const magnification = magnificationFromZoom(zoom, 20);

  return (
    <div className="flex items-center gap-2">
      <Input
        isReadOnly
        value={magnification.toFixed(1)}
        size="sm"
        className="w-16 text-xs text-right tabular-nums"
      />

      <ResetViewStateButton
        metadata={metadata}
        viewState={viewStateActive}
        setViewState={setViewStateActive}
      />

      <SegmentedControl
        selectionMode="none"
        size="sm"
        aria-label="Magnification presets"
      >
        {MAGNIFICATION_PRESETS.map((mag) => (
          <SegmentedControlItem
            key={mag}
            id={String(mag)}
            onPress={() => {
              if (viewStateActive) {
                setViewStateActive({
                  ...viewStateActive,
                  zoom: zoomFromMagnification(mag),
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
