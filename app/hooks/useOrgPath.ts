import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router";

import { useCurrentUser } from "./useCurrentUser";
import { organizationFromPath, orgPath } from "~/utils/orgPath";

/** The org alias map the client-safe profile carries (root loader projection). */
type UserOrganizations = Record<string, { groups: readonly string[] }> | undefined;

/**
 * The org this page acts in: the URL's `/:org` segment when present, else the
 * alphabetically-first membership alias for org-less chrome. The URL is
 * authoritative — the profile carries only the membership map, so links built
 * off-URL would point at another tab's org.
 */
export function useActiveOrg(): string | undefined {
  const { pathname } = useLocation();
  const user = useCurrentUser();
  return organizationFromPath(pathname) ?? firstOrgAlias(user?.organizations);
}

function firstOrgAlias(organizations: UserOrganizations | undefined): string | undefined {
  const aliases = Object.keys(organizations ?? {}).sort();
  return aliases[0];
}

/**
 * Every in-app link needs the organization prefix now that the tenant is part
 * of the URL. The org resolves from
 * the URL (see useActiveOrg), so hrefs always point at the tenant the page is
 * rendered for, without threading a prop through every component.
 */
export function useOrgPath(): (path: string) => string {
  const organization = useActiveOrg();
  return useCallback((path: string) => orgPath(organization, path), [organization]);
}

/**
 * `navigate` for callers holding a tenant-relative app path — plugin
 * contributions, which are written against the routes as mounted inside
 * `/:org` and never see the alias. A relative path or a history delta is
 * forwarded untouched.
 */
export function useOrgNavigate(): (to: string | number) => void {
  const navigate = useNavigate();
  const orgPathFor = useOrgPath();
  return useCallback(
    (to: string | number) => {
      if (typeof to === "number") {
        navigate(to);
        return;
      }
      navigate(to.startsWith("/") ? orgPathFor(to) : to);
    },
    [navigate, orgPathFor],
  );
}
