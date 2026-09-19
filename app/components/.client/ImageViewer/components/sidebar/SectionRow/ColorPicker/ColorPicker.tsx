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

import { ColorSwatch, hex } from "./ColorSwatch";
import { CATEGORICAL_COLORS } from "./utils";
import { RGB, RGBA } from "../../../../state/store/types";

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
  colors: (RGB | RGBA)[];
  /** Absent: read-only static swatch(es), no picker popover. */
  onColorChange?: (color: RGB | RGBA) => void;
  /** Accessible name for the swatch/trigger. */
  label?: string;
}

export function ColorPicker({ colors, onColorChange, label }: ColorPickerProps) {
  const [first] = colors;
  if (first == null) return null;

  const [r, g, b, alpha] = first;

  if (colors.length > 1 || !onColorChange) {
    return <ColorSwatch colors={colors} isDisabled />;
  }

  const apply = (rgbChoice: RGB) =>
    onColorChange(alpha != null ? [...rgbChoice, alpha] : rgbChoice);

  return (
    // Stop mousedown/pointerdown reaching a parent press target (RAC <Radio>),
    // whose global listener would preventDefault the nested hex-field input.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <Popover>
        <ColorSwatch colors={colors} aria-label={label ? `Edit ${label}` : "Open color picker"} />

        <PopoverContent placement="bottom start" data-theme="dark">
          <RacColorPicker
            value={parseColor(`rgb(${r}, ${g}, ${b})`).toFormat("hsb")}
            onChange={(color) => {
              const rgb = color.toFormat("rgb");
              apply([
                rgb.getChannelValue("red"),
                rgb.getChannelValue("green"),
                rgb.getChannelValue("blue"),
              ]);
            }}
          >
            <div className="flex flex-col">
              <div className="flex items-center px-2 py-1">
                {COLOR_PALLETTE_WITH_WHITE.map((preset, index) => (
                  <ColorSwatch
                    key={index}
                    colors={[preset]}
                    onPress={() => apply(preset)}
                    aria-label={`Preset color ${hex(preset)}`}
                  />
                ))}
              </div>

              <div className="flex flex-col gap-2 border-t p-2">
                <ColorArea
                  colorSpace="hsb"
                  xChannel="saturation"
                  yChannel="brightness"
                  className="relative w-full h-40 rounded-sm touch-none"
                >
                  <ColorThumb className="block w-4 h-4 rounded-full border-2 border-white shadow-md focus-visible:outline-2 focus-visible:outline-ring" />
                </ColorArea>

                <ColorSlider colorSpace="hsb" channel="hue" className="w-full" aria-label="Hue">
                  <SliderTrack className="relative h-3 rounded-sm touch-none">
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
