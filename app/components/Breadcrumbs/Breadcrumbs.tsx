import {
  Breadcrumbs as DesignBreadcrumbs,
  type BreadcrumbItem,
} from "@cytario/design";
import { Link , UIMatch, useMatches } from "react-router";


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

  const rootCrumb = crumbs.find((c) => c.isRoot);
  const navCrumbs = crumbs.filter((c) => !c.isRoot);

  const items: BreadcrumbItem[] = navCrumbs.map((crumb) => ({
    id: crumb.to,
    label: crumb.label,
    href: crumb.isActive ? undefined : crumb.to,
  }));

  return (
    <div className="flex h-full items-center mx-2 gap-1">
      {rootCrumb && (
        <Link to={rootCrumb.to} className="flex items-center h-full px-1">
          <Logo scale={1.4} />
        </Link>
      )}
      {items.length > 0 && (
        <DesignBreadcrumbs
          items={items}
          className="flex items-center overflow-hidden"
        />
      )}
    </div>
  );
}
