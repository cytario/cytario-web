import React, { forwardRef } from "react";
import { twMerge } from "tailwind-merge";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  align?: "left" | "center" | "right";
  scale?: "small" | "medium" | "large";
  theme?: "dark" | "light";
  prefix?: string;
}

const baseStyle = `
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
  ({ className, scale = "medium", theme = "light", prefix, ...props }, ref) => {
    const inputCx = twMerge(
      baseStyle,
      sizeStyles[scale],
      themes[theme],
      prefix && "rounded-l-none border-l-0",
      className,
    );

    if (prefix) {
      return (
        <div className="flex w-full">
          <span
            className={twMerge(
              "flex items-center rounded-l-sm border border-r-0 px-2",
              sizeStyles[scale],
              theme === "dark"
                ? "border-slate-500 bg-slate-800 text-slate-400"
                : "border-slate-300 bg-slate-100 text-slate-500",
            )}
          >
            {prefix}
          </span>
          <input ref={ref} {...props} className={inputCx} />
        </div>
      );
    }

    return <input ref={ref} {...props} className={inputCx} />;
  },
);

Input.displayName = "Input";

export { Input };
