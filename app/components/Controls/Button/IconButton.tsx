import { PointerEventHandler, ReactNode } from "react";
import { twMerge } from "tailwind-merge";

import { Icon, type LucideIconsType } from "./Icon";
import {
  buttonThemeStyles,
  iconButtonBaseStyles,
  iconButtonScaleStyles,
} from "./styles";
import { Tooltip } from "../../Tooltip/Tooltip";

export interface IconButtonBaseProps {
  icon: LucideIconsType;
  children?: ReactNode;
  className?: string;
  scale?: keyof typeof iconButtonScaleStyles;
  theme?: keyof typeof buttonThemeStyles;
}

interface IconButtonProps extends IconButtonBaseProps {
  onClick: PointerEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  label?: string;
}

export function IconButton({
  icon,
  onClick,
  disabled,
  className,
  label,
  scale = "medium",
  theme = "default",
}: IconButtonProps) {
  const cx = twMerge(
    iconButtonBaseStyles,
    iconButtonScaleStyles[scale],
    buttonThemeStyles[theme],
    className,
  );

  const button = (
    <button
      type="button"
      className={cx}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
    >
      <Icon icon={icon} strokeWidth={1.5} />
    </button>
  );

  // If label is provided, wrap with Tooltip
  if (label) {
    return <Tooltip content={label}>{button}</Tooltip>;
  }

  return button;
}
