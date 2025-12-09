import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";

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
  border-slate-500 hover:border-slate-300
  cursor-pointer 
  transition-colors
  focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300
`;

export function ColorPicker({ color, onColorChange }: ColorPickerProps) {
  return (
    <Popover className="relative">
      <PopoverButton
        className={style}
        style={{ backgroundColor: rgb(color) }}
      />

      <PopoverPanel
        anchor="bottom start"
        className="z-50 bg-slate-800 border border-slate-600 rounded-sm p-2 shadow-lg"
      >
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
      </PopoverPanel>
    </Popover>
  );
}
