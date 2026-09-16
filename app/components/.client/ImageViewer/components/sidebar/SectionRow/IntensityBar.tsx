import { rgb } from "./ColorPicker/ColorPicker";
import { RGB, RGBA } from "../../../state/store/types";

interface IntensityBarProps {
  count?: number;
  countMax?: number;
  color?: RGB | RGBA;
}

/** Bottom edge bar: count relative to countMax, in the row's color. */
export function IntensityBar({ count, countMax, color }: IntensityBarProps) {
  if (count == null || countMax == null || color == null) return null;

  return (
    <div className="absolute bottom-0 left-3.5 right-3.5 h-0.5">
      <div
        className="h-full border-l border-r border-muted-foreground"
        style={{ width: `${(count / countMax) * 100}%`, backgroundColor: rgb(color) }}
      />
    </div>
  );
}
