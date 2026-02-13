import { ReactNode } from "react";
import { twMerge } from "tailwind-merge";

export const ThumbnailBox = ({ children }: { children?: ReactNode }) => {
  const style = `
    absolute right-0 bottom-0 left-0 top-0
    bg-slate-700 border border-white
    origin-top-left
    group-hover:bg-slate-500
    transition-all

  `;
  return (
    <>
      <div className={twMerge(style, "bottom-4 right-4")}>{children}</div>
      <div
        className={twMerge(
          style,
          "top-auto bottom-0 right-4 h-4 skew-x-[45deg]",
        )}
      />
      <div
        className={twMerge(
          style,
          "left-auto right-0 bottom-4 w-4 skew-y-[45deg]",
        )}
      />
    </>
  );
};
