import {
  IconButton,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@cytario/design";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import {
  ColorArea,
  ColorField,
  ColorPicker as RacColorPicker,
  ColorSlider,
  ColorThumb,
  Input,
  parseColor,
  SliderTrack,
  type Color,
} from "react-aria-components";

import { ColorSwatch } from "./ColorSwatch";
import { hexToRgb, rgbToHex } from "./colorUtils";
import { RGB, RGBA } from "../../../state/store/types";
import { OVERLAY_COLORS } from "../../OverlaysController/getOverlayState";

export function rgb(color: RGB | RGBA, alpha = 255): string {
  const rgb = color.slice(0, 3);
  return `rgba(${rgb.join(", ")}, ${alpha})`;
}

const WHITE: RGBA = [255, 255, 255, 255];
const QUICK_PICKS: RGBA[] = [...OVERLAY_COLORS, WHITE];

interface ColorPickerProps {
  color: RGBA;
  onColorChange: (color: RGBA) => void;
}

const swatchStyle = `

  flex flex-shrink-0
  w-6 h-6 p-12
  rounded-full
  border-2
  border-[var(--color-border-strong)] hover:border-[var(--color-text-secondary)]
  cursor-pointer
  transition-colors
  focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)]
`;

function emitColor(
  c: Color,
  alpha: number,
  onColorChange: (rgba: RGBA) => void,
) {
  const rgb = hexToRgb(c.toString("hex"));
  if (rgb) onColorChange([rgb[0], rgb[1], rgb[2], alpha]);
}

export function ColorPicker({ color, onColorChange }: ColorPickerProps) {
  const [expanded, setExpanded] = useState(false);
  const alpha = color[3];

  return (
    <Popover onOpenChange={(isOpen) => !isOpen && setExpanded(false)}>
      <PopoverTrigger>
        <span className={swatchStyle} style={{ backgroundColor: rgb(color) }} />
      </PopoverTrigger>

      <PopoverContent placement="bottom start" className="">
        {() => (
          <RacColorPicker
            value={parseColor(rgbToHex(color)).toFormat("hsb")}
            onChange={(c) => emitColor(c, alpha, onColorChange)}
          >
            <div className="flex flex-col">
              <div className="flex items-center gap-0">
                {QUICK_PICKS.map((color, index) => (
                  <ColorSwatch
                    key={index}
                    color={color}
                    onColorChange={onColorChange}
                  />
                ))}

                <IconButton
                  icon={expanded ? ChevronUp : ChevronDown}
                  onClick={() => setExpanded((value) => !value)}
                  aria-label={`${expanded ? "Hide" : "Show"} advanced picker`}
                  aria-expanded={expanded}
                />
              </div>

              {expanded && (
                <div className="flex flex-col gap-2 border-t">
                  <ColorArea
                    colorSpace="hsb"
                    xChannel="saturation"
                    yChannel="brightness"
                    className="relative w-full h-40 rounded touch-none"
                  >
                    <ColorThumb className="block w-4 h-4 rounded-full border-2 border-white shadow-md focus-visible:outline-2 focus-visible:outline-(--color-border-focus)" />
                  </ColorArea>

                  <ColorSlider
                    colorSpace="hsb"
                    channel="hue"
                    className="w-full"
                    aria-label="Hue"
                  >
                    <SliderTrack className="relative h-3 rounded touch-none">
                      <ColorThumb className="block w-4 h-4 rounded-full border-2 border-white shadow-md top-1/2 focus-visible:outline-2 focus-visible:outline-(--color-border-focus)" />
                    </SliderTrack>
                  </ColorSlider>

                  <ColorField
                    className="flex items-center gap-1"
                    aria-label="Hex"
                  >
                    <span className="text-xs text-(--color-text-secondary)">
                      #
                    </span>
                    <Input className="flex-1 px-2 py-1 text-xs font-mono uppercase rounded border border-(--color-border-default) bg-(--color-surface-default) text-(--color-text-primary) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-border-focus) data-invalid:border-(--color-text-error)" />
                  </ColorField>
                </div>
              )}
            </div>
          </RacColorPicker>
        )}
      </PopoverContent>
    </Popover>
  );
}
