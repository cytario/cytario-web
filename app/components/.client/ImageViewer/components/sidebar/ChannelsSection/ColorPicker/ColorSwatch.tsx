import { Tooltip } from "@cytario/design";
import { Button, ButtonProps } from "react-aria-components";

import { rgb } from "./ColorPicker";
import { RGB } from "../../../../state/store/types";

/** Hex form of an RGB color, e.g. "#ef4444". */
export const hex = (color: RGB): string =>
  `#${color.map((value) => value.toString(16).padStart(2, "0")).join("")}`;

interface ColorSwatchProps extends ButtonProps {
  colors: RGB[];
  /** Tooltip text; falls back to the accessible name, then the color value(s). */
  tooltip?: string;
}

export function ColorSwatch({ colors, tooltip, ...props }: ColorSwatchProps) {
  const cx = "w-5 h-5 rounded-full border-2 border-border";

  return (
    <Tooltip content={tooltip ?? props["aria-label"] ?? colors.map(hex).join(" / ")}>
      <Button
        className="group flex items-center justify-center cursor-pointer disabled:cursor-not-allowed"
        {...props}
      >
        {colors.length > 1 ? (
          <span className={`flex overflow-hidden ${cx}`}>
            {colors.map((color, index) => (
              <span key={index} className="grow h-full" style={{ backgroundColor: rgb(color) }} />
            ))}
          </span>
        ) : (
          <div className={cx} style={{ backgroundColor: rgb(colors[0]) }} />
        )}
      </Button>
    </Tooltip>
  );
}
