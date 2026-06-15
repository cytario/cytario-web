import { Input, SegmentedControl, SegmentedControlItem } from "@cytario/design";

import { ResetViewStateButton } from "./Image/ResetViewStateButton";
import { ShareViewButton } from "./Image/ShareViewButton";
import { type ViewerStore, type ViewState } from "../state/store/types";

const MAGNIFICATION_PRESETS = [5, 10, 20, 40, 80] as const;

export const zoomFromMagnification = (magnification: number, objectivePower = 20): number =>
  Math.log2(magnification / objectivePower);

export const magnificationFromZoom = (zoom: number, objectivePower = 20): number =>
  objectivePower * Math.pow(2, zoom);

export const Magnifier = ({
  metadata,
  viewStateActive,
  viewStateUrl,
  setViewStateActive,
  clearSharedView,
}: {
  metadata: ViewerStore["metadata"] | null;
  viewStateActive: ViewState | null;
  viewStateUrl: ViewState | null;
  setViewStateActive: (viewState: ViewState) => void;
  clearSharedView: () => void;
}) => {
  const zoom = viewStateActive?.zoom ?? 0;
  const magnification = magnificationFromZoom(zoom, 20);

  return (
    <div className="flex items-center gap-2">
      {/* Magnification: current readout + presets */}
      <Input
        isReadOnly
        aria-label="Current magnification"
        value={`${magnification.toFixed(1)}x`}
        size="sm"
        className="w-16 text-xs text-right tabular-nums"
      />

      <SegmentedControl selectionMode="none" size="sm" aria-label="Magnification presets">
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

      {/* Separator between magnification and view-state actions */}
      <div className="h-5 w-px bg-(--color-border-default)" aria-hidden="true" />

      {/* View-state actions: reset (fit to screen) + share viewport link */}
      <ResetViewStateButton
        metadata={metadata}
        viewState={viewStateActive}
        viewStateUrl={viewStateUrl}
        setViewState={setViewStateActive}
        clearSharedView={clearSharedView}
      />

      <ShareViewButton
        metadata={metadata}
        viewStateActive={viewStateActive}
        viewStateUrl={viewStateUrl}
      />
    </div>
  );
};
