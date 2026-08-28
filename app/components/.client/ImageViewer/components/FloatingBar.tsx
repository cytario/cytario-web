import type { HTMLAttributes } from "react";
import { twMerge } from "tailwind-merge";

/** Floating overlay bar: absolute-positioned pill with blur background. */
export const FloatingBar = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div
    {...props}
    className={twMerge(
      `
        z-30 absolute
        flex flex-row items-center
        p-2 gap-4 rounded-full
        bg-background/80 backdrop-blur-sm
        shadow-md
      `,
      className,
    )}
  />
);
