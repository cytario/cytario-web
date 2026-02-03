import { PointerEventHandler, ReactNode } from "react";
import { twMerge } from "tailwind-merge";

import {
  buttonScaleStyles,
  buttonBaseStyles,
  buttonThemeStyles,
} from "./styles";

interface ButtonProps {
  onClick?: PointerEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
  type?: "button" | "submit" | "reset";
  scale?: keyof typeof buttonScaleStyles;
  theme?: keyof typeof buttonThemeStyles;
}

export function Button({
  onClick,
  disabled,
  children,
  className,
  type = "button",
  scale = "medium",
  theme = "default",
}: ButtonProps) {
  const cx = twMerge(
    buttonBaseStyles,
    buttonScaleStyles[scale],
    buttonThemeStyles[theme],
    className,
  );

  return (
    <button className={cx} onClick={onClick} disabled={disabled} type={type}>
      {children}
    </button>
  );
}
