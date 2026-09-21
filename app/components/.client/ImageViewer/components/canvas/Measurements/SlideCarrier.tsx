import { useMeasurements } from "./useMeasurements";
import { useViewerStore } from "../../../state/store/core/ViewerStoreContext";
import { select } from "../../../state/store/selectors";
import { useDisplayUnitStore } from "~/utils/displayUnitStore/useDisplayUnitStore";

export function SlideCarrier() {
  const {
    widthTotalMm,
    heightTotalMm,
    imageWidthScreen,
    imageHeightScreen,
    screenOffsetLeft,
    screenOffsetTop,
    viewPortWidth,
    viewPortHeight,
  } = useMeasurements();
  const displayUnit = useDisplayUnitStore((s) => s.displayUnit);
  const metadata = useViewerStore(select.metadata);

  const widthTotal = displayUnit === "pixels" ? (metadata?.Pixels.SizeX ?? 0) : widthTotalMm;
  const heightTotal = displayUnit === "pixels" ? (metadata?.Pixels.SizeY ?? 0) : heightTotalMm;

  return (
    <div
      style={{ width: viewPortWidth, height: viewPortHeight }}
      className="absolute top-0 left-0 overflow-hidden"
    >
      <Size value={widthTotal} unit={displayUnit === "pixels" ? "px" : "mm"} />
      <Size vertical value={heightTotal} unit={displayUnit === "pixels" ? "px" : "mm"} />
      <div
        className="absolute top-0 left-0 bg-black"
        style={{
          transform: `translate(${screenOffsetLeft}px, ${screenOffsetTop}px)`,
          width: imageWidthScreen,
          height: imageHeightScreen,
        }}
      />
    </div>
  );
}

const Size = ({
  value,
  unit,
  vertical = false,
}: {
  value: number;
  unit: "mm" | "px";
  vertical?: boolean;
}) => {
  const { imageWidthScreen, imageHeightScreen, screenOffsetLeft, screenOffsetTop } =
    useMeasurements();

  const transform = vertical
    ? `translate(${screenOffsetLeft}px, ${screenOffsetTop - 18}px) rotate(90deg)`
    : `translate(${screenOffsetLeft}px, ${screenOffsetTop - 18}px)`;

  const n = Math.round(value * 100) / 100;
  const label = `${n} ${unit}`;

  return (
    <div
      className={`
        flex items-center justify-center
        h-4 
        origin-top-left 
        text-xs font-semibold
        text-muted-foreground
        `}
      style={{
        width: vertical ? imageHeightScreen : imageWidthScreen,
        transform,
      }}
    >
      {label}
    </div>
  );
};
