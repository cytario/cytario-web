import { Input, Popover, PopoverContent } from "@cytario/design";
import {
  ColorArea,
  ColorField,
  ColorPicker as RacColorPicker,
  ColorSlider,
  ColorThumb,
  parseColor,
  SliderTrack,
} from "react-aria-components";

import { ColorSwatch } from "./ColorSwatch";
import { CATEGORICAL_COLORS } from "../../../categoricalColors";
import { RGB, RGBA } from "../../../state/store/types";

export function rgb(color: RGB | RGBA, alpha = 255): string {
  const rgb = color.slice(0, 3);
  return `rgba(${[...rgb, alpha].join(", ")})`;
}

const WHITE: RGB = [255, 255, 255];
const COLOR_PALLETTE_WITH_WHITE: RGB[] = [
  ...CATEGORICAL_COLORS.map(([r, g, b]): RGB => [r, g, b]),
  WHITE,
];

interface ColorPickerProps {
  color: RGB;
  onColorChange?: (color: RGB) => void;
  /** Read-only: render the swatch statically, without the picker popover. */
  isDisabled?: boolean;
  /** Accessible name for the swatch/trigger (e.g. the class/channel it colors). */
  label?: string;
}

export function ColorPicker({ color, onColorChange, isDisabled, label }: ColorPickerProps) {
  if (isDisabled) {
    return <ColorSwatch color={color} isDisabled aria-label={label ?? "Color"} />;
  }

  return (
    // Isolate trigger events from any parent press target (e.g. RAC <Radio>):
    // mousedown bubbling into the parent puts it in "press" state, whose global
    // listener then preventDefaults nested input clicks (the hex field).
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <Popover>
        {/* ColorSwatch as PopoverTrigger */}
        <ColorSwatch color={color} aria-label={label ? `Edit ${label}` : "Open color picker"} />

        <PopoverContent placement="bottom start" data-theme="dark">
          <RacColorPicker
            value={parseColor(`rgb(${color[0]}, ${color[1]}, ${color[2]})`).toFormat("hsb")}
            onChange={(color) => {
              const rgb = color.toFormat("rgb");
              onColorChange?.([
                rgb.getChannelValue("red"),
                rgb.getChannelValue("green"),
                rgb.getChannelValue("blue"),
              ]);
            }}
          >
            <div className="flex flex-col">
              <div className="flex items-center px-2 py-1">
                {COLOR_PALLETTE_WITH_WHITE.map((color, index) => (
                  <ColorSwatch
                    key={index}
                    color={color}
                    onPress={() => onColorChange?.(color)}
                    aria-label={`Preset color ${color}`}
                  />
                ))}
              </div>

              <div className="flex flex-col gap-2 border-t p-2">
                <ColorArea
                  colorSpace="hsb"
                  xChannel="saturation"
                  yChannel="brightness"
                  className="relative w-full h-40 rounded touch-none"
                >
                  <ColorThumb className="block w-4 h-4 rounded-full border-2 border-white shadow-md focus-visible:outline-2 focus-visible:outline-ring" />
                </ColorArea>

                <ColorSlider colorSpace="hsb" channel="hue" className="w-full" aria-label="Hue">
                  <SliderTrack className="relative h-3 rounded touch-none">
                    <ColorThumb className="block w-4 h-4 rounded-full border-2 border-white shadow-md top-1/2 focus-visible:outline-2 focus-visible:outline-ring" />
                  </SliderTrack>
                </ColorSlider>

                <Input as={ColorField} size="sm" prefix="#" aria-label="Hex" />
              </div>
            </div>
          </RacColorPicker>
        </PopoverContent>
      </Popover>
    </div>
  );
}
