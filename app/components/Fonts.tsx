import { ReactNode } from "react";
import { twMerge } from "tailwind-merge";

interface HeadingProps {
  children: ReactNode;
  className?: string;
}

export function H1({ children, className }: HeadingProps) {
  const cx = twMerge("gap-1 text-3xl", className);
  return <h1 className={cx}>{children}</h1>;
}

export function H2({ children, className }: HeadingProps) {
  const cx = twMerge("gap-1 text-2xl", className);
  return <h2 className={cx}>{children}</h2>;
}

export function H3({ children, className }: HeadingProps) {
  const cx = twMerge("gap-1 text-lg", className);
  return <h3 className={cx}>{children}</h3>;
}
