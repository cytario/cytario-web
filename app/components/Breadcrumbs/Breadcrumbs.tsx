import { Button, Icon, Logo, Menu, MenuItem, MenuSection } from "@cytario/design";
import { Link, UIMatch, useLocation, useMatches } from "react-router";

import { buildOrgCrumbs, nodeToTrail } from "./breadcrumbTrail";
import { type TreeNode } from "../DirectoryView/buildDirectoryTree";
import { NodeLink } from "../DirectoryView/NodeLink/NodeLink";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import { orgPath, switchOrgPath } from "~/utils/orgPath";

type NodeMatch = UIMatch<unknown, { node?: (match: NodeMatch) => TreeNode | null }>;

const ORGANIZATIONS_SECTION = "Organizations";

/**
 * The root crumb: which organization the page belongs to. With more than one
 * membership it is the switcher — picking an org navigates to the same view in
 * it, and the org layout's middleware moves the session, so the loaders below
 * re-run for the new tenant.
 */
function OrgCrumb({ activeOrganization }: { activeOrganization: string }) {
  const { pathname } = useLocation();
  const user = useCurrentUser();
  const crumbs = buildOrgCrumbs(Object.keys(user?.organizations ?? {}), activeOrganization);

  if (crumbs.length < 2) {
    return (
      <span className="flex items-center px-1 text-sm font-medium text-foreground">
        {activeOrganization}
      </span>
    );
  }

  return (
    <Menu
      content={
        <MenuSection header={ORGANIZATIONS_SECTION} aria-label={ORGANIZATIONS_SECTION}>
          {crumbs.map((crumb) => (
            <MenuItem
              key={crumb.alias}
              id={crumb.alias}
              href={switchOrgPath(crumb.alias, pathname)}
              endContent={crumb.isActive ? <Icon icon="Check" size="sm" /> : undefined}
            >
              {crumb.alias}
            </MenuItem>
          ))}
        </MenuSection>
      }
    >
      <Button
        variant="ghost"
        size="sm"
        iconLeft="Building2"
        iconRight="ChevronDown"
        aria-label="Switch organization"
      >
        {activeOrganization}
      </Button>
    </Menu>
  );
}

export function Breadcrumbs() {
  const matches = useMatches() as NodeMatch[];
  const activeOrganization = useCurrentUser()?.organization;

  const trail: TreeNode[] = matches
    .filter((match) => typeof match.handle?.node === "function")
    .flatMap((match) => {
      const node = match.handle.node!(match);
      return node ? nodeToTrail(node) : [];
    });

  return (
    <nav aria-label="Breadcrumb" className="flex h-full min-w-0 items-center overflow-hidden">
      <Link
        to={orgPath(activeOrganization, "/")}
        aria-label="Go to home"
        className="flex items-center h-full px-2"
      >
        <Logo scale={1.4} />
      </Link>
      {activeOrganization && (
        <div className="flex h-full shrink-0 items-center">
          <OrgCrumb activeOrganization={activeOrganization} />
          {trail.length > 0 && (
            <Icon icon="ChevronRight" size="sm" className="text-muted-foreground" />
          )}
        </div>
      )}
      <ol className="flex min-w-0 items-center">
        {trail.map((node, index) => {
          const isLeaf = index === trail.length - 1;
          return (
            <li
              key={node.id}
              className="flex min-w-0 items-center"
              aria-current={isLeaf ? "page" : undefined}
            >
              {index > 0 && (
                <Icon icon="ChevronRight" size="sm" className="text-muted-foreground" />
              )}
              <NodeLink node={node} />
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
