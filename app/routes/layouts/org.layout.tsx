import { Outlet } from "react-router";

import { orgScopeMiddleware } from "~/.server/orgScope/orgScopeMiddleware";

// `authMiddleware` already runs on the parent protected layout; this only adds
// the URL-to-session reconciliation, which needs that authenticated context.
export const middleware = [orgScopeMiddleware];

/**
 * Every organization-scoped route renders inside `/o/:org`, so the tenant is
 * part of the URL: a pasted or bookmarked link carries the organization it was
 * copied in, and a tenant switch is a navigation rather than hidden state.
 */
export default function OrgLayout() {
  return <Outlet />;
}
