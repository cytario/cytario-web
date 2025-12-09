import React, { forwardRef } from "react";
import { twMerge } from "tailwind-merge";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  align?: "left" | "center" | "right";
  scale?: "small" | "medium" | "large";
  theme?: "dark" | "light";
}

const style = `
  flex w-full border rounded-sm
  transition duration-100 ease-in 
  disabled:opacity-50 disabled:cursor-not-allowed
`;

const sizeStyles = {
  small: "h-6 px-2 text-sm",
  medium: "h-8 px-2 text-base",
  large: "h-12 px-2 text-lg",
};

const themes = {
  dark: "bg-slate-950 border-slate-500 text-slate-300 ",
  light: "bg-white border-slate-300 text-slate-700",
};

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, scale = "medium", theme = "light", ...props }, ref) => {
    const cx = twMerge(style, sizeStyles[scale], themes[theme], className);
    return <input ref={ref} {...props} className={cx} />;
  }
);

Input.displayName = "Input";

export default Input;
