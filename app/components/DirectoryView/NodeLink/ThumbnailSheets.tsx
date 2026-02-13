import { ReactNode } from "react";
import { twMerge } from "tailwind-merge";

import { ThumbnailLabel, type ThumbnailMeta } from "./ThumbnailLabel";

const Sheet = ({
  children,
  offset,
}: {
  offset: number;
  children?: React.ReactNode;
}) => {
  const cx = twMerge(
    `
    absolute
    border border-white
    bg-slate-300
    group-hover:bg-slate-500
    transition-all
  `,
    `top-${4 - offset}`,
    `left-${4 - offset}`,
    `right-${offset}`,
    `bottom-${offset}`,
  );
  return <div className={cx}>{children}</div>;
};

export const ThumbnailSheets = ({
  children,
  metadata,
}: {
  metadata?: ThumbnailMeta[];
  children?: ReactNode;
}) => {
  return (
    <div className="relative w-full h-full">
      <Sheet offset={0} />
      <Sheet offset={2} />
      <Sheet offset={4}>{children}</Sheet>
      <ThumbnailLabel metadata={metadata} />
    </div>
  );
};
