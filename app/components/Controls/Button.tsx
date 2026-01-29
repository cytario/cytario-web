import { PointerEventHandler, ReactNode } from "react";
import { Link, LinkProps } from "react-router";
import { twMerge } from "tailwind-merge";

interface ButtonProps {
  onClick?: PointerEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
  type?: "button" | "submit" | "reset";
  scale?: keyof typeof scaleStyles;
  theme?: keyof typeof themeStyles;
}

const style = `
  inline-flex items-center justify-center self-center w-auto
  rounded-sm border gap-1 px-2
  disabled:cursor-not-allowed disabled:opacity-50
  whitespace-nowrap font-bold
`;

const scaleStyles = {
  small: "h-6 text-sm",
  medium: "h-8 text-base",
  large: "h-12 text-lg",
};

export const themeStyles = {
  default: `
    bg-slate-800 hover:bg-slate-700 text-slate-300
    border border-slate-500
  `,
  transparent: `
    bg-transparent hover:bg-white/20 text-inherit
  `,
  white: `
    bg-white hover:bg-slate-50 text-inherit
    border border-inherit
  `,
  primary: `
    bg-cytario-turquoise-500 hover:bg-cytario-turquoise-700 text-white
    border border-cytario-turquoise-500 border-t-cytario-turquoise-300 border-b-cytario-turquoise-700
  `,
  error: `
    bg-rose-700 hover:bg-rose-500 text-white
    border border-rose-500 border-t-rose-300 border-b-rose-900
  `,
  success: `
    bg-green-700 hover:bg-green-500 text-white
    border border-green-500 border-t-green-300 border-b-green-900
  `,
  info: `
    bg-slate-700 hover:bg-slate-500 text-white
    border border-slate-500 border-t-slate-300 border-b-slate-900
  `,
};

export function Button({
  onClick,
  disabled,
  children,
  className,
  type = "button",
  scale = "medium",
  theme = "default",
}: ButtonProps) {
  const cx = twMerge(style, scaleStyles[scale], themeStyles[theme], className);

  return (
    <button className={cx} onClick={onClick} disabled={disabled} type={type}>
      {children}
    </button>
  );
}

export const ButtonLink = ({
  className,
  scale = "medium",
  theme = "default",
  download = false,
  ...props
}: LinkProps & {
  scale?: keyof typeof scaleStyles;
  theme?: keyof typeof themeStyles;
  download?: boolean;
}) => {
  const cx = twMerge(style, scaleStyles[scale], themeStyles[theme], className);
  return (
    <Link
      {...props}
      className={cx}
      download={download}
      reloadDocument={download}
    />
  );
};
