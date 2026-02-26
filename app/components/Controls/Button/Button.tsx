import { forwardRef, PointerEventHandler, ReactNode } from "react";
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
  form?: string;
  scale?: keyof typeof buttonScaleStyles;
  theme?: keyof typeof buttonThemeStyles;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      onClick,
      disabled,
      children,
      className,
      type = "button",
      form,
      scale = "medium",
      theme = "default",
    },
    ref,
  ) {
    const cx = twMerge(
      buttonBaseStyles,
      buttonScaleStyles[scale],
      buttonThemeStyles[theme],
      className,
    );

    return (
      <button
        ref={ref}
        className={cx}
        onClick={onClick}
        disabled={disabled}
        type={type}
        form={form}
      >
        {children}
      </button>
    );
  },
);
