import { Button, ButtonProps } from "react-aria-components";

import { rgb } from "./ColorPicker";
import { RGB } from "../../../state/store/types";

interface ColorSwatchProps extends ButtonProps {
  color: RGB;
}

export function ColorSwatch({ color, ...props }: ColorSwatchProps) {
  const cx = `
    w-5 h-5 rounded-full border-2
    border-border group-hover:border-border
  `;

  return (
    <Button
      className={`
        group flex items-center justify-center 
        cursor-pointer disabled:cursor-default
      `}
      {...props}
    >
      <div className={cx} style={{ backgroundColor: rgb(color) }} />
    </Button>
  );
}
