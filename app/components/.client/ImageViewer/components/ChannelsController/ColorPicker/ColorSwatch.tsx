import { Button, ButtonProps } from "react-aria-components";

import { rgb } from "./ColorPicker";
import { RGBA } from "../../../state/store/types";

interface ColorSwatchProps extends ButtonProps {
  color: RGBA;
}

export function ColorSwatch({ color, ...props }: ColorSwatchProps) {
  return (
    <Button
      className="group cursor-pointer flex items-center justify-center"
      {...props}
    >
      <div
        className={`
          w-5 h-5 m-1 rounded-full border-2 
          border-(--color-border-default) group-hover:border-(--color-border-strong)
        `}
        style={{ backgroundColor: rgb(color) }}
      />
    </Button>
  );
}
