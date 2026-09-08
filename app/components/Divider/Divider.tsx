import { MetricText } from "@cytario/design";
import type { HTMLAttributes, ReactNode } from "react";
import { twMerge } from "tailwind-merge";

const BASE = "px-2 py-2 border-b border-border";

/** Small muted label with a bottom border — group/section divider. */
export function Divider({
  children,
  className,
  ...rest
}: { children?: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return (
    <MetricText className={twMerge(BASE, className)} {...rest}>
      {children}
    </MetricText>
  );
}
