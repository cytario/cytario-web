import {
  ButtonLink,
  Icon,
  IconButton,
  Logo,
  Menu,
  MenuItem,
  MenuSection,
  TruncatedText,
} from "@cytario/design";
import { Link, UIMatch, useMatches } from "react-router";

import { buildOrgCrumbs, nodeToTrail } from "./breadcrumbTrail";
import { type TreeNode } from "../DirectoryView/buildDirectoryTree";
import { NodeLink } from "../DirectoryView/NodeLink/NodeLink";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import { useActiveOrg } from "~/hooks/useOrgPath";
import { orgPath, switchOrgPath } from "~/utils/orgPath";

type NodeMatch = UIMatch<unknown, { node?: (match: NodeMatch) => TreeNode | null }>;

const ORGANIZATIONS_SECTION = "Organizations";

const JOIN_CX = "-ms-px z-10 hover:bg-muted";
const ARROW_CX = `${JOIN_CX} rounded-s-none -ps-2`;

/**
 * The root crumb: which organization the page belongs to. Always a button
 * linking to the active organization's connection list with the org icon —
 * single-membership included. The membership menu arrow is only rendered
 * for a multi-membership session; nothing to switch for one membership.
 */
function OrgCrumb({ activeOrganization }: { activeOrganization: string }) {
  const user = useCurrentUser();
  const crumbs = buildOrgCrumbs(Object.keys(user?.organizations ?? {}), activeOrganization);

  return (
    <div role="group" aria-label="Switch organization" className="flex items-center rounded-full">
      <ButtonLink
        href={orgPath(activeOrganization, "/")}
        variant="ghost"
        size="sm"
        iconLeft="Building2"
        className={crumbs.length > 1 ? "rounded-e-none pe-1 max-w-48" : "max-w-48"}
        aria-label={`${activeOrganization} connections`}
      >
        <TruncatedText>{activeOrganization}</TruncatedText>
      </ButtonLink>
      {crumbs.length > 1 && (
        <Menu
          content={
            <MenuSection header={ORGANIZATIONS_SECTION} aria-label={ORGANIZATIONS_SECTION}>
              {crumbs.map((crumb) => (
                <MenuItem
                  key={crumb.alias}
                  id={crumb.alias}
                  // A switch is a full document navigation, not a router one:
                  // the CSP connect-src is derived per HTML response from the
                  // org its URL names, so a client-side switch would leave the
                  // browser holding the previous org's host allowlist and the
                  // new org's bucket fetches would be blocked until a reload.
                  // The menu item acts instead of linking so react-aria's
                  // router binding can't intercept it.
                  onAction={() => {
                    window.location.assign(switchOrgPath(crumb.alias));
                  }}
                  endContent={crumb.isActive ? <Icon icon="Check" size="sm" /> : undefined}
                  className={crumb.isActive ? "font-semibold text-primary" : undefined}
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
      )}
    </div>
  );
}

export function Breadcrumbs() {
  const matches = useMatches() as NodeMatch[];
  // The URL's org segment is the truth for this page; org-less chrome falls
  // back to the first membership alias.
  const activeOrganization = useActiveOrg();

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
