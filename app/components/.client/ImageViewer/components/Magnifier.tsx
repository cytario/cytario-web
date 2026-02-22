import { Button, Input, InputGroup } from "@cytario/design";

import { ResetViewStateButton } from "./Image/ResetViewStateButton";
import { type ViewerStore, type ViewState } from "../state/types";

const zoomFromMagnification = (
  magnification: number,
  objectivePower = 20,
): number => Math.log2(magnification / objectivePower);

const magnificationFromZoom = (zoom: number, objectivePower = 20): number =>
  objectivePower * Math.pow(2, zoom);

const size = 40; // w-10

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
  const color = zoom <= 0 ? "bg-[var(--color-text-secondary)]" : "bg-[var(--color-action-danger)]";

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

      <div className="flex items-center relative h-full">
        <InputGroup className="border border-[var(--color-border-default)] rounded-[var(--border-radius-md)]">
          {[5, 10, 20, 40, 80].map((mag) => {
            return (
              <Button
                key={mag}
                variant="ghost"
                size="sm"
                className="w-9 text-xs p-0 justify-center font-semibold"
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
              </Button>
            );
          })}
        </InputGroup>

        {/* Magnification Indicator */}
        <div
          className={`absolute right-0 top-9 h-1 w-10 rounded-t-sm ${color}`}
          style={{ right: -zoom * size + 2 * size }}
        />
      </div>
    </div>
  );
};
