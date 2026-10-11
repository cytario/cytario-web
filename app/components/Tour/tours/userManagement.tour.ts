import { USER_MANAGEMENT_TOUR_ID, type TourContext, type TourDefinition } from "../tourRegistry";

/** The user-management screen for the admin's first scope — what the user menu links to. */
function adminUsersUrl(context: Pick<TourContext, "adminScopes">): string {
  const scope = context.adminScopes[0] ?? "";
  return `/admin/users?scope=${encodeURIComponent(scope)}`;
}

/** A connections screen with shareable rows — the share step navigates here first. */
const CONNECTIONS_URL = "/connections";

/**
 * Walks an organization admin through bringing teammates in: reaching the
 * user-management screen from the user menu, inviting a user, and sharing a
 * connection with a group so the invitee can actually see data. Offered only
 * to users with at least one admin scope — every step targets admin
 * affordances a plain member never sees.
 */
export const userManagementTour: TourDefinition = {
  id: USER_MANAGEMENT_TOUR_ID,
  title: "User management and sharing",
  menuLabel: "User management and sharing tour",
  steps: [
    {
      target: 'button[aria-label="User menu"]',
      title: "Your account menu",
      content:
        "You administer at least one group, so your account menu lists the admin " +
        "areas you manage. Open it to reach user management.",
    },
    {
      // The user-management screen's action row; its entries (invite, create
      // group) are the screen's core affordances. The provider navigates to
      // the admin's first scope — the screen 400s without one. Scoped to the
      // page header: the empty state renders a second invite CTA in main.
      target: 'main header a[href*="/admin/users/invite"]',
      title: "User management",
      content:
        "This screen lists each group's members and its connections. Open the " +
        "user menu anytime to come back here.",
      data: { navigateToFromContext: adminUsersUrl },
    },
    {
      target: 'main header a[href*="/admin/users/invite"]',
      title: "Invite a user",
      content:
        "Inviting a user emails them a Keycloak invite. Group membership and " +
        "access levels are assigned after they accept.",
    },
    {
      // The share action lives in a connection row's context menu, so the tour
      // navigates back to the connections screen and points at a row.
      target: 'main a[href^="/connections/"]',
      title: "Share a connection or folder",
      content:
        "An invited user sees nothing until a connection is shared with their " +
        "group. Right-click a connection or folder and choose Share to grant a " +
        "group access — the access level you pick here is what they get.",
      data: { navigateToFromContext: () => CONNECTIONS_URL },
    },
    {
      target: 'button[aria-label="Help"]',
      content: "That's the admin loop — invite, share, and they can start working.",
    },
  ],
  // Admin affordances only render for admins; never auto-start even for them,
  // it is a deliberate deep-dive rather than part of first-run orientation.
  shouldAutoStart: () => false,
  // Offered whenever the user administers at least one group.
  isAvailable: ({ adminScopes }) => adminScopes.length > 0,
  // Admin chrome renders with the route; a long wait would only spin.
  targetWaitMs: 5000,
};
