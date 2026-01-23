import { ReactNode } from "react";

export const ThumbnailFile = ({ children }: { children?: ReactNode }) => {
  return (
    <div className="relative w-full h-full bg-black border border-white">
      {children}
      <svg
        viewBox="0 0 16 16"
        className="absolute top-0 right-0 w-4 h-4 bg-white fill-black stroke-white stroke-4"
      >
        <polygon points="0,0 0,16 16,16" strokeWidth={2} />
      </svg>
    </div>
  );
};
