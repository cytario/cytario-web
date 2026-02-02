import { Link } from "react-router";
import { twMerge } from "tailwind-merge";

import { Icon } from "./Icon";
import { IconButtonBaseProps } from "./IconButton";
import {
  buttonBaseStyle,
  buttonThemeStyles,
  iconButtonScaleStyles,
} from "./styles";
import { Tooltip } from "~/components/Tooltip/Tooltip";

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
  const cx = twMerge(
    buttonBaseStyle,
    iconButtonScaleStyles[scale],
    buttonThemeStyles[theme],
    className,
  );

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
