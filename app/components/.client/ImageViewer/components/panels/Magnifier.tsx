import { Input, SegmentedControl, SegmentedControlItem } from "@cytario/design";

import { select } from "../../state/store/selectors";
import { useViewerStore } from "../../state/store/ViewerStoreContext";
import { ImagePreview } from "../canvas/ImagePreview";
import { ResetViewStateButton } from "../canvas/ResetViewStateButton";
import { FeatureItem } from "~/components/FeatureItem/FeatureItem";

const MAGNIFICATION_PRESETS = [1, 2, 5, 10, 20, 40, 80] as const;

export const zoomFromMagnification = (magnification: number, objectivePower = 20): number =>
  Math.log2(magnification / objectivePower);

export const magnificationFromZoom = (zoom: number, objectivePower = 20): number =>
  objectivePower * Math.pow(2, zoom);

export const Magnifier = () => {
  const metadata = useViewerStore(select.metadata);
  const viewStateActive = useViewerStore(select.viewStateActive);
  const setViewStateActive = useViewerStore(select.setViewStateActive);

  const zoom = viewStateActive?.zoom ?? 0;
  const magnification = magnificationFromZoom(zoom, 20);

  return (
    <FeatureItem
      title="Overview"
      actions={
        <ResetViewStateButton
          metadata={metadata}
          viewState={viewStateActive}
          setViewState={setViewStateActive}
        />
      }
    >
      <div className="block h-60 w-full shrink-0">
        <ImagePreview isInteractive />
      </div>
      <div className="flex items-center gap-1 px-2 py-2">
        <Input
          isReadOnly
          value={magnification.toFixed(1)}
          size="sm"
          aria-label="Current magnification"
          className="w-12 shrink-0 text-xs text-right tabular-nums"
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
    </FeatureItem>
  );
};
