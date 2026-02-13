import { UIMatch, useMatches } from "react-router";

import { BreadcrumbLink } from "./BreadcrumbLink";
import { Logo } from "../Logo";

export interface BreadcrumbData {
  label: string;
  to: string;
  isRoot?: boolean;
  isActive?: boolean;
}

type BreadcrumbMatch = UIMatch<
  null,
  { breadcrumb: (match: BreadcrumbMatch) => BreadcrumbData | BreadcrumbData[] }
>;

export function Breadcrumbs() {
  const matches = useMatches() as BreadcrumbMatch[];
  const filteredMatches = matches.filter(
    (match) => match.handle && match.handle.breadcrumb
  );

  const crumbs = filteredMatches.flatMap((match) => {
    const result = match.handle.breadcrumb(match);
    return Array.isArray(result) ? result : [result];
  });

  return (
    <div className="flex h-full mx-2">
      <ul className="flex overflow-hidden">
        {crumbs.map((crumb) =>
          crumb.isRoot ? (
            <BreadcrumbLink key={crumb.to} to={crumb.to} isRoot>
              <Logo scale={1.4} />
            </BreadcrumbLink>
          ) : (
            <BreadcrumbLink
              key={crumb.to}
              to={crumb.to}
              className={crumb.isActive ? "text-white" : ""}
            >
              {crumb.label}
            </BreadcrumbLink>
          )
        )}
      </ul>
    </div>
  );
}
