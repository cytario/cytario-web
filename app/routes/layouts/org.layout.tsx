import { Outlet } from "react-router";

/**
 * Every organization-scoped route renders inside `/:org`, so the tenant is
 * part of the URL: a pasted or bookmarked link carries the organization it was
 * copied in, and a tenant switch is a plain navigation. The org this request
 * acts in is resolved by `authMiddleware` from the URL (validated against the
 * session's memberships); no per-request reconciliation is needed here.
 */
export default function OrgLayout() {
  return <Outlet />;
}
