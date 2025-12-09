import { icons as lucideIcons } from "lucide-react";
import { PointerEventHandler, ReactNode } from "react";
import { Link } from "react-router";
import { twMerge } from "tailwind-merge";

import { themeStyles } from "./Button";
import { Tooltip } from "../Tooltip/Tooltip";

const lucids = lucideIcons;

export type LucideIconsType = keyof typeof lucideIcons;

export function Icon({
  icon,
  className,
  size = 20,
  strokeWidth = 2,
}: Readonly<{
  icon: LucideIconsType;
  className?: string;
  size?: number;
  strokeWidth?: number;
}>) {
  const I = lucids[icon];

  return (
    <div className={className}>
      <I
        role="img"
        size={size}
        strokeWidth={strokeWidth}
        absoluteStrokeWidth={true}
      />
    </div>
  );
}

interface IconButtonBaseProps {
  icon: LucideIconsType;
  children?: ReactNode;
  className?: string;
  scale?: keyof typeof sizeStyles;
  theme?: keyof typeof themeStyles;
}

interface IconButtonProps extends IconButtonBaseProps {
  onClick: PointerEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  label?: string;
}

const style = `
  flex place-items-center place-content-center flex-shrink-0
  rounded-sm border border-slate-500 text-white
  disabled:opacity-50 disabled:cursor-not-allowed
`;

const sizeStyles = {
  small: "w-4 h-4",
  medium: "w-8 h-8",
  large: "w-12 h-12",
};

export function IconButton({
  icon,
  onClick,
  disabled,
  className,
  label,
  scale = "medium",
  theme = "default",
}: IconButtonProps) {
  const cx = twMerge(style, sizeStyles[scale], themeStyles[theme], className);

  const button = (
    <button
      type="button"
      className={cx}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
    >
      <Icon icon={icon} />
    </button>
  );

  // If label is provided, wrap with Tooltip
  if (label) {
    return <Tooltip content={label}>{button}</Tooltip>;
  }

  return button;
}

interface IconButtonLinkProps extends IconButtonBaseProps {
  to: string;
  label?: string;
}

export function IconButtonLink({
  to,
  icon,
  className,
  scale = "medium",
  theme = "default",
  label,
}: IconButtonLinkProps) {
  const cx = twMerge(style, sizeStyles[scale], themeStyles[theme], className);

  const link = (
    <Link to={to} className={cx} aria-label={label}>
      <Icon icon={icon} />
    </Link>
  );

  if (label) {
    return <Tooltip content={label}>{link}</Tooltip>;
  }

  return link;
}
