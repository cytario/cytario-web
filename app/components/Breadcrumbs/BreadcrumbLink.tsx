import { ReactNode } from "react";
import { Link } from "react-router";
import { twMerge } from "tailwind-merge";

import { Icon } from "../Controls";
import { TooltipSpan } from "../Tooltip/TooltipSpan";

const style = `
  flex items-center h-full px-1 gap-1
  text-slate-500 hover:text-slate-300
  text-nowrap text-sm

`;

export function BreadcrumbLink({
  to,
  children,
  className = "",
  isRoot = false,
}: Readonly<{
  key: string;
  to: string;
  children: ReactNode;
  className?: string;
  isRoot?: boolean;
}>) {
  const listItemStyle = twMerge(
    "h-full",
    !isRoot ? "min-w-8 shrink last:shrink-0" : "",
  );
  const linkStyle = twMerge(style, className);

  return (
    <li className={listItemStyle}>
      <Link to={to} className={linkStyle}>
        {!isRoot && <Icon icon="Slash" strokeWidth={1} />}
        <TooltipSpan>{children}</TooltipSpan>
      </Link>
    </li>
  );
}
