import { ByteDomain } from "../../state/types";

const normalizeY = (value: number, maxLogValue: number, height: number) => {
  const logValue = Math.log(value + 1);
  const normalizedY = (logValue / maxLogValue) * height;
  return height - normalizedY;
};

const normalizeX = (index: number, length: number, width: number) =>
  (index / (length - 1)) * width;

interface HistogramChannelProps {
  channelIndex: number;
  maxLogValue: number;
  width: number;
  height: number;
  histogram: number[];
  color: string;
  contrastLimit: ByteDomain;
  range: number;
}
export const HistogramChannel = ({
  channelIndex,
  maxLogValue,
  width,
  height,

  /*  */
  histogram,
  color,
  contrastLimit,
  range,
}: HistogramChannelProps) => {
  const _points: string = histogram
    .map((value, index, arr) => {
      const normalizedX = normalizeX(index, arr.length, width);
      const normalizedY = normalizeY(value, maxLogValue, height);
      return [normalizedX, normalizedY].join(",");
    })
    .join(" ");

  const points = `0,${height} ${_points}`;
  const [min, max] = contrastLimit;
  const scaledMin = (min / range) * width;
  const scaledMax = (max / range) * width;
  const rectWidth = scaledMax - scaledMin;
  const id = `clip-${channelIndex}`;

  return (
    <g key={id}>
      {/* Domain Mask */}
      <defs>
        <clipPath id={id}>
          <rect
            x={scaledMin}
            y={0}
            width={rectWidth}
            height={height}
            fill="white"
            fillOpacity={1}
            stroke={color}
          />
        </clipPath>
      </defs>

      {/* Min Value */}
      <line x1={scaledMin} y1={0} x2={scaledMin} y2={height} stroke={color} />

      {/* Max Value */}
      <line x1={scaledMax} y1={0} x2={scaledMax} y2={height} stroke={color} />
      <polygon
        stroke={color}
        strokeWidth={1}
        strokeOpacity={1}
        points={points}
        fill={color}
        fillOpacity={0.1}
      />
      <polygon
        points={points}
        fill={color}
        fillOpacity={0.5}
        clipPath={`url(#${id})`}
      />
    </g>
  );
};
