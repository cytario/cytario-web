import { Slash } from "lucide-react";
import { ReactNode } from "react";
import { Link } from "react-router";
import { twMerge } from "tailwind-merge";

import { TooltipSpan } from "../Tooltip/TooltipSpan";

const style = `
  flex items-center h-full px-1 
  text-slate-500 hover:text-slate-300
  text-nowrap text-sm

`;

export default function BreadcrumbLink({
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
  const listItemStyle = twMerge("h-full", !isRoot ? "min-w-0 shrink" : "");
  const linkStyle = twMerge(style, className);

  return (
    <li className={listItemStyle}>
      <Link to={to} className={linkStyle}>
        {!isRoot && (
          <Slash className="mr-1 size-3 stroke-lime" size={5} strokeWidth={2} />
        )}
        <TooltipSpan>{children}</TooltipSpan>
      </Link>
    </li>
  );
}
