import { countToRatio, intensityToRatio } from "./axisScale";
import { ByteDomain } from "../../state/store/types";

interface HistogramChannelProps {
  channelIndex: number;
  maxValue: number;
  logScaleX: boolean;
  logScaleY: boolean;
  width: number;
  height: number;
  histogram: number[];
  color: string;
  contrastLimit: ByteDomain;
  range: number;
}
export const HistogramChannel = ({
  channelIndex,
  maxValue,
  logScaleX,
  logScaleY,
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
      const intensity = (index / (arr.length - 1)) * range;
      const normalizedX = intensityToRatio(intensity, range, logScaleX) * width;
      const normalizedY = height - countToRatio(value, maxValue, logScaleY) * height;
      return [normalizedX, normalizedY].join(",");
    })
    .join(" ");

  const points = `0,${height} ${_points}`;
  const [min, max] = contrastLimit;
  const scaledMin = intensityToRatio(min, range, logScaleX) * width;
  const scaledMax = intensityToRatio(max, range, logScaleX) * width;
  const rectWidth = Math.max(0, scaledMax - scaledMin);
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
      <polygon points={points} fill={color} fillOpacity={0.5} clipPath={`url(#${id})`} />
    </g>
  );
};
