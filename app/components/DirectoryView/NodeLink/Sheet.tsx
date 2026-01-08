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
    absolute top-${offset} left-${offset} right-${4 - offset} bottom-${4 - offset}
    bg-black 
    border border-white
  `,
    `top-${offset}`,
    `left-${offset}`,
    `right-${4 - offset}`,
    `bottom-${4 - offset}`
  );
  return <div className={cx}>{children}</div>;
};

export const ThumbnailSheets = ({
  children,
  count = 0,
}: {
  count?: number;
  children: ReactNode;
}) => {
  return (
    <div className="relative w-full h-full">
      <Sheet offset={4} />
      <Sheet offset={2} />
      <Sheet offset={0}>{children}</Sheet>
      <div
        className={`
             absolute top-2 right-6
             flex items-center justify-center
             px-1 h-4 min-w-4
             text-sm font-bold
           text-slate-700 bg-white
         `}
      >
        {count}
      </div>
    </div>
  );
};
