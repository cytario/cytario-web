import { ReactNode } from "react";
import { twMerge } from "tailwind-merge";

import { ThumbnailLabel } from "./ThumbnailLabel";

export const ThumbnailBox = ({
  children,
  label,
}: {
  children?: ReactNode;
  label?: string;
}) => {
  const style = `
    absolute right-0 bottom-0 left-0 top-0
    bg-black border border-white
    origin-top-left
  `;
  return (
    <div className="relative w-full h-full">
      <div className={twMerge(style, "right-4 h-4 skew-x-[45deg]")} />
      <div className={twMerge(style, "bottom-4 w-4 skew-y-[45deg]")} />
      <div className={twMerge(style, "top-4 left-4")}>{children}</div>
      <ThumbnailLabel>{label}</ThumbnailLabel>
    </div>
  );
};
