import { orgPath, stripOrgPath } from "~/utils/orgPath";

export type OrgScopeResolution =
  /** The URL's organization is the session's organization — nothing to do. */
  | { kind: "active" }
  /** The URL names another membership; the session must move to it. */
  | { kind: "switch"; organization: string }
  /** The URL names an organization this session cannot use. */
  | { kind: "redirect"; to: string };

export interface OrgScopeInput {
  /** Alias from the `/o/:org` URL segment, absent outside the prefix. */
  urlOrganization?: string;
  /** The session's tenant, already reconciled against the token's memberships. */
  activeOrganization?: string;
  /** Every alias the token carries. */
  organizations: readonly string[];
  pathname: string;
  search?: string;
  /** A state-changing request cannot change tenant: it would replay its body. */
  canSwitch?: boolean;
}

/**
 * Decides what the URL's organization means for this request. A URL org the user
 * belongs to becomes the session's org; one they do not belong to is not an
 * error — the request goes back to the org the session is actually in, keeping
 * its sub-path, so a stale bookmark or a revoked membership degrades to "you are
 * here" rather than a 403.
 */
export function resolveOrgScope({
  urlOrganization,
  activeOrganization,
  organizations,
  pathname,
  search = "",
  canSwitch = true,
}: OrgScopeInput): OrgScopeResolution {
  if (!urlOrganization) return { kind: "active" };

  const target = activeOrganization ?? organizations[0];

  if (organizations.includes(urlOrganization) && canSwitch) {
    return urlOrganization === activeOrganization
      ? { kind: "active" }
      : { kind: "switch", organization: urlOrganization };
  }

  if (!target) return { kind: "redirect", to: "/onboarding" };

  if (urlOrganization === target) return { kind: "active" };

  return { kind: "redirect", to: `${orgPath(target, stripOrgPath(pathname))}${search}` };
}
