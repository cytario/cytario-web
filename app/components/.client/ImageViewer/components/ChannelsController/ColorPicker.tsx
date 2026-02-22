import { Popover, PopoverContent, PopoverTrigger } from "@cytario/design";

import { RGB, RGBA } from "../../state/types";
import { OVERLAY_COLORS } from "../OverlaysController/getOverlayState";

export function rgb(color: RGB | RGBA, alpha = 255): string {
  const rgb = color.slice(0, 3);
  return `rgba(${rgb.join(", ")}, ${alpha})`;
}

interface ColorPickerProps {
  color: RGBA;
  onColorChange: (color: RGBA) => void;
}

const style = `
  flex flex-shrink-0
  w-5 h-5 rounded-full
  border-2
  border-[var(--color-border-strong)] hover:border-[var(--color-text-secondary)]
  cursor-pointer
  transition-colors
  focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]
`;

export function ColorPicker({ color, onColorChange }: ColorPickerProps) {
  return (
    <Popover>
      <PopoverTrigger>
        <span
          className={style}
          style={{ backgroundColor: rgb(color) }}
        />
      </PopoverTrigger>

      <PopoverContent placement="bottom start" className="p-2">
        {({ close }) => (
          <div className="flex gap-2">
            {OVERLAY_COLORS.map((presetColor, idx) => (
              <button
                key={idx}
                onClick={() => {
                  onColorChange(presetColor);
                  close();
                }}
                className={style}
                style={{ backgroundColor: rgb(presetColor) }}
              />
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
