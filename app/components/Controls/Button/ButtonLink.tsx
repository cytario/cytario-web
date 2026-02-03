import { Link, LinkProps } from "react-router";
import { twMerge } from "tailwind-merge";

import {
  buttonScaleStyles,
  buttonBaseStyles,
  buttonThemeStyles,
} from "./styles";

export const ButtonLink = ({
  className,
  scale = "medium",
  theme = "default",
  download = false,
  ...props
}: LinkProps & {
  scale?: keyof typeof buttonScaleStyles;
  theme?: keyof typeof buttonThemeStyles;
  download?: boolean;
}) => {
  const cx = twMerge(
    buttonBaseStyles,
    buttonScaleStyles[scale],
    buttonThemeStyles[theme],
    className,
  );
  return (
    <Link
      {...props}
      className={cx}
      download={download}
      reloadDocument={download}
    />
  );
};
