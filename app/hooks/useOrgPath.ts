import { useCallback } from "react";
import { useNavigate } from "react-router";

import { useCurrentUser } from "./useCurrentUser";
import { orgPath } from "~/utils/orgPath";

/**
 * The session's active organization alias. `authMiddleware` reconciles it
 * against the token before any loader runs, so this is the tenant the rendered
 * page actually belongs to.
 */
export function useActiveOrg(): string | undefined {
  return useCurrentUser()?.organization;
}

/**
 * Every in-app link needs the organization prefix now that the tenant is part of
 * the URL. Reading it from the loaders keeps the hrefs pointing at the tenant
 * the page is rendered for, without threading a prop through every component.
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
