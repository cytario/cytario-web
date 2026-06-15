import { ReactNode } from "react";
import { twMerge } from "tailwind-merge";

interface FooterProps {
  children: ReactNode;
  className?: string;
}
export function Footer({ children, className }: FooterProps) {
  const cx = twMerge("px-6 p-2 bg-card border-t border-border", className);
  return (
    <footer className={cx}>
      <div className="container mx-auto flex justify-between">{children}</div>
    </footer>
  );
}
