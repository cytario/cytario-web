import { ReactNode } from "react";

const clipPath =
  "polygon(0% 0%, calc(100% - 1rem) 0%, 100% 1rem, 100% 100%, 0% 100%)";

export const ThumbnailFile = ({ children }: { children?: ReactNode }) => {
  return (
    <>
      <div
        className={`
          absolute inset-0
          border border-white
          bg-slate-700
          group-hover:bg-slate-500
          transition-all
        `}
        style={{ clipPath }}
      >
        {children}
      </div>
      <svg
        viewBox="0 0 16 16"
        className={`
          absolute top-0 right-0 w-4 h-4
          fill-slate-700
          stroke-white stroke-4
          group-hover:fill-slate-500
          transition-all
        `}
      >
        <polygon points="0,0 0,16 16,16" strokeWidth={2} />
      </svg>
    </>
  );
};
