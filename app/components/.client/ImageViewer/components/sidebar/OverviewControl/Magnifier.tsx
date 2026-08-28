import { Input, Button } from "@cytario/design";
import { twMerge } from "tailwind-merge";

import { select } from "../../../state/store/selectors";
import { useViewerStore } from "../../../state/store/ViewerStoreContext";
import { ResetViewStateButton } from "../../canvas/ResetViewStateButton";

const MAGNIFICATION_PRESETS = [1, 2, 5, 10, 20, 40, 80] as const;

export const zoomFromMagnification = (magnification: number, objectivePower = 20): number =>
  Math.log2(magnification / objectivePower);

export const magnificationFromZoom = (zoom: number, objectivePower = 20): number =>
  objectivePower * Math.pow(2, zoom);

// Logarithmic axis anchored at 20x (zoom = 0); map zoom to a normalized 0..1 position
// spanning the preset range so buttons and the indicator share one grid.
const PRESET_ZOOMS = MAGNIFICATION_PRESETS.map((m) => zoomFromMagnification(m, 20));
const Z_MIN = PRESET_ZOOMS[0];
const Z_MAX = PRESET_ZOOMS[PRESET_ZOOMS.length - 1];
// Unclamped so the indicator can run past the ends for zooms outside the preset range.
const axisPos = (zoom: number) => (zoom - Z_MIN) / (Z_MAX - Z_MIN);

// Minor ticks: integers 1–19 and every 5x above 20x, excluding preset values.
const MINOR_MAGNIFICATIONS = [
  ...Array.from({ length: 19 }, (_, i) => i + 1),
  ...Array.from({ length: 12 }, (_, i) => 25 + i * 5),
].filter((m) => !(MAGNIFICATION_PRESETS as readonly number[]).includes(m));

/** Magnification presets: log-scale posts with a snapping indicator. */
export const Magnifier = () => {
  const viewStateActive = useViewerStore(select.viewStateActive);
  const setViewStateActive = useViewerStore(select.setViewStateActive);

  const zoom = viewStateActive?.zoom ?? 0;
  const magnification = magnificationFromZoom(zoom, 20);

  const setZoom = (mag: number) => {
    if (viewStateActive) {
      setViewStateActive({
        ...viewStateActive,
        zoom: zoomFromMagnification(mag, 20),
      });
    }
  };

  const roundedMag = Number(magnification.toFixed(1));

  const CENTER = "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2";

  return (
    <div className={"flex gap-2 mx-3 my-3"}>
      <div className="relative z-1 flex items-center gap-2">
        <ResetViewStateButton />
        <Input
          isReadOnly
          value={magnification.toFixed(1) + "x"}
          size="sm"
          aria-label="Current magnification"
          align="right"
          className="w-18 shrink-0 tabular-nums"
        />
      </div>

      <div role="group" aria-label="Magnification presets" className="relative h-10 flex-1 mx-5">
        {/* Slate */}
        <div
          aria-hidden
          className={twMerge(
            `
              absolute top-1/2 -translate-y-1/2
              left-1 right-1
              h-3
              bg-border
            `,
          )}
        >
          <div
            className="absolute inset-y-0.5 h-2 bg-primary rounded-full"
            style={{
              left: `${axisPos(zoomFromMagnification(20)) * 100}%`,
              right: `${(1 - axisPos(zoomFromMagnification(80))) * 100}%`,
            }}
          />
        </div>

        {/* Indicator */}
        <div
          aria-hidden
          className={twMerge(CENTER, "h-3 w-3 border bg-muted-foreground rounded-full")}
          style={{ left: `${axisPos(zoom) * 100}%` }}
        />

        {[...MINOR_MAGNIFICATIONS, ...MAGNIFICATION_PRESETS].map((m) => {
          const isPreset = (MAGNIFICATION_PRESETS as readonly number[]).includes(m);
          return (
            <Button
              key={m}
              variant="outline"
              onPress={() => setZoom(m)}
              aria-label={`${m}x`}
              className={twMerge(
                CENTER,
                "backdrop-blur-xl bg-card rounded-full",
                isPreset ? "w-10 h-10 text-sm select-none " : "p-0 h-3 w-3 ",
                roundedMag === m &&
                  "ring-2 ring-muted-foreground ring-offset-2 ring-offset-background",
              )}
              style={{ left: `${axisPos(zoomFromMagnification(m, 20)) * 100}%` }}
            >
              {isPreset ? `${m}x` : undefined}
            </Button>
          );
        })}
      </div>
    </div>
  );
};
