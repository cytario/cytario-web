import type { HTMLAttributes, ReactNode } from "react";
import { twMerge } from "tailwind-merge";

const BASE = "px-2 pb-1 text-xs text-muted-foreground border-b border-border";

/** Small muted label with a bottom border — group/section divider. */
export function Divider({
  children,
  className,
  ...rest
}: { children?: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={twMerge(BASE, className)} {...rest}>
      {children}
    </div>
  );
}
