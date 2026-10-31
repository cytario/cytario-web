import { ButtonLink, Icon, IconButton, Logo, Menu, MenuItem, MenuSection } from "@cytario/design";
import { Link, UIMatch, useMatches } from "react-router";

import { buildOrgCrumbs, nodeToTrail } from "./breadcrumbTrail";
import { type TreeNode } from "../DirectoryView/buildDirectoryTree";
import { NodeLink } from "../DirectoryView/NodeLink/NodeLink";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import { orgPath, switchOrgPath } from "~/utils/orgPath";

type NodeMatch = UIMatch<unknown, { node?: (match: NodeMatch) => TreeNode | null }>;

const ORGANIZATIONS_SECTION = "Organizations";

const JOIN_CX = "-ms-px z-10 hover:bg-muted";
const ARROW_CX = `${JOIN_CX} rounded-s-none -ps-2`;

/**
 * The root crumb: which organization the page belongs to. A split button for
 * a multi-membership session — the label navigates to the active
 * organization's connection list, the arrow opens the membership menu, and
 * picking an org lands on that org's connection list (the same sub-path in
 * another tenant would 404, so it is never carried over). A single-membership
 * session renders the label read-only.
 */
function OrgCrumb({ activeOrganization }: { activeOrganization: string }) {
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
    <div role="group" aria-label="Switch organization" className="flex items-center rounded-full">
      <ButtonLink
        href={orgPath(activeOrganization, "/")}
        variant="ghost"
        size="sm"
        iconLeft="Building2"
        className="rounded-e-none pe-1"
        aria-label={`${activeOrganization} connections`}
      >
        {activeOrganization}
      </ButtonLink>
      <Menu
        content={
          <MenuSection header={ORGANIZATIONS_SECTION} aria-label={ORGANIZATIONS_SECTION}>
            {crumbs.map((crumb) => (
              <MenuItem
                key={crumb.alias}
                id={crumb.alias}
                href={switchOrgPath(crumb.alias)}
                endContent={crumb.isActive ? <Icon icon="Check" size="sm" /> : undefined}
              >
                {crumb.alias}
              </MenuItem>
            ))}
          </MenuSection>
        }
      >
        <IconButton
          icon="ChevronDown"
          label="Switch organization"
          variant="ghost"
          size="sm"
          className={ARROW_CX}
        />
      </Menu>
    </div>
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
