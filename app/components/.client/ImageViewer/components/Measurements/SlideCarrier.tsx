import { useMeasurements } from "./useMeasurements";

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

  return (
    <div
      style={{ width: viewPortWidth, height: viewPortHeight }}
      className="absolute top-0 left-0overflow-hidden"
    >
      <Size value={widthTotalMm} />
      <Size vertical value={heightTotalMm} />
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
  vertical = false,
}: {
  value: number;
  vertical?: boolean;
}) => {
  const {
    imageWidthScreen,
    imageHeightScreen,
    screenOffsetLeft,
    screenOffsetTop,
  } = useMeasurements();

  const transform = vertical
    ? `translate(${screenOffsetLeft}px, ${screenOffsetTop - 18}px) rotate(90deg)`
    : `translate(${screenOffsetLeft}px, ${screenOffsetTop - 18}px)`;

  const n = Math.round(value * 100) / 100;
  const label = `${n} mm`;

  return (
    <div
      className={`
        flex items-center justify-center
        h-4 
        origin-top-left 
        text-xs font-semibold
      text-[var(--color-text-secondary)]
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
