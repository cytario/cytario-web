import { rgb } from "./ColorPicker";
import { RGBA } from "../../../state/store/types";

export function ColorSwatch({
  color,
  onColorChange,
}: {
  color: RGBA;
  onColorChange: (rgba: RGBA) => void;
}) {
  return (
    <button
      onClick={() => {
        onColorChange(color);
      }}
      className={`
        group
        cursor-pointer
        flex items-center justify-center
      `}
      aria-label={`Preset color ${color}`}
    >
      <div
        className={`
          w-6 h-6 m-1 rounded-full border-2 
          group-hover:scale-120
          transition-transform
        `}
        style={{ backgroundColor: rgb(color) }}
      />
    </button>
  );
}
