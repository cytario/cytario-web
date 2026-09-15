import { rgb } from "./ColorPicker/ColorPicker";
import { RGB, RGBA } from "../../../state/store/types";

interface IntensityBarProps {
  count?: number;
  /** The scale maximum count is measured against. */
  countMax?: number;
  color?: RGB | RGBA;
}

/** Bottom edge bar: count relative to countMax, in the row's color. */
export function IntensityBar({ count, countMax, color }: IntensityBarProps) {
  if (count == null || countMax == null || color == null) return null;

  return (
    <div className="absolute bottom-0 left-0 right-0 h-0.5">
      <div
        className="h-full"
        style={{ width: `${(count / countMax) * 100}%`, backgroundColor: rgb(color) }}
      />
    </div>
  );
}
