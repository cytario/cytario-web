import { redirect, type MiddlewareFunction } from "react-router";

import { resolveOrgScope } from "./resolveOrgScope";
import { selectActiveOrganization } from "../auth/activeOrganization.server";
import { authContext } from "../auth/authMiddleware";
import { sessionContext } from "../auth/sessionMiddleware";
import { createLabel } from "../logging";

const label = createLabel("org-scope", "magenta");

const canSwitchOrganization = (method: string): boolean => method === "GET" || method === "HEAD";

/**
 * Reconciles the organization in the URL with the organization on the session.
 * Runs after `authMiddleware`, so the session is authenticated and its active
 * organization is already validated against the token's memberships.
 *
 * - URL org is the active org: continue.
 * - URL org is another membership (on a navigation): switch the session and
 *   redirect to the same URL. The redirect is what makes the switch safe — the
 *   session's credentials were minted for the previous org (the assumed-role
 *   policy pins the org), so they are dropped and `authMiddleware` re-mints them
 *   for the new org on the next request. Rendering inline would hand the new
 *   tenant the old tenant's credentials.
 * - URL org is not usable by this session: redirect to the org it is in.
 */
export const orgScopeMiddleware: MiddlewareFunction = async (
  { request, url, params, context },
  next,
) => {
  const session = context.get(sessionContext);
  if (!session) {
    throw new Error("Session not found in context. Ensure sessionMiddleware runs first.");
  }

  const { user, activeOrganization } = context.get(authContext);

  const resolution = resolveOrgScope({
    urlOrganization: typeof params.org === "string" ? params.org : undefined,
    activeOrganization: activeOrganization ?? user.organization,
    organizations: Object.keys(user.organizations ?? {}),
    pathname: url.pathname,
    search: url.search,
    canSwitch: canSwitchOrganization(request.method),
  });

  if (resolution.kind === "active") return next();

  if (resolution.kind === "redirect") {
    console.info(`${label} ${url.pathname} is not available in this session, redirecting`);
    return redirect(resolution.to);
  }

  console.info(`${label} Switching session to ${resolution.organization}`);
  session.set("credentials", {});
  const switched = await selectActiveOrganization(session, user, resolution.organization);

  return redirect(`${url.pathname}${url.search}`, {
    headers: { "Set-Cookie": switched.setCookie },
  });
};
