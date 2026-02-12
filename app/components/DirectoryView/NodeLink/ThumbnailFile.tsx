import { ReactNode } from "react";

export const ThumbnailFile = ({ children }: { children?: ReactNode }) => {
  const style = `
    relative w-full h-full
    border border-white
    bg-slate-300
    group-hover:bg-slate-500
    transition-all
  `;

  const cx = `
    absolute top-0 right-0 w-4 h-4 
    bg-white 
    fill-slate-300 
    stroke-white stroke-4
    group-hover:fill-slate-500
    transition-all
  `;

  return (
    <div className={style}>
      {children}
      <svg viewBox="0 0 16 16" className={cx}>
        <polygon points="0,0 0,16 16,16" strokeWidth={2} />
      </svg>
    </div>
  );
};
