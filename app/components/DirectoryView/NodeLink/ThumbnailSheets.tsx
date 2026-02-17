import { ReactNode } from "react";
import { twMerge } from "tailwind-merge";

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
    bg-slate-700
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

export const ThumbnailSheets = ({ children }: { children?: ReactNode }) => {
  return (
    <>
      <Sheet offset={0} />
      <Sheet offset={2} />
      <Sheet offset={4}>{children}</Sheet>
    </>
  );
};
