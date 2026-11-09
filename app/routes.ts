import { type RouteConfig, layout, prefix, route } from "@react-router/dev/routes";

/** OIDC authentication flow — server-side redirects, no rendered UI, no layout needed. */
const authRoutes = [
  {
    path: "/login",
    file: "routes/auth/login.route.tsx",
  },
  {
    path: "/logout",
    file: "routes/auth/logout.route.tsx",
  },
  {
    path: "/auth/callback",
    file: "routes/auth/callback.route.tsx",
  },
  {
    path: "/auth/refresh",
    file: "routes/auth/refresh.route.tsx",
  },
  {
    path: "/onboarding",
    file: "routes/onboarding.route.tsx",
  },
];

/**
 * Main application routes. Paths are relative to `/:org` — the organization a
 * view belongs to is the first path segment, so a link is shareable and a
 * tenant switch is a navigation. `org.layout.tsx` reconciles the alias with the
 * session before any of these render. An org can never be named after a
 * reserved top-level route (login, api, recent, …): alias creation refuses
 * those names, and the reserved list in `utils/orgPath` keeps the layout's
 * catch-all honest. The org root is the connection list; the object browser is
 * `/:org/:connectionId/…`.
 */
const orgAppRoutes = [
  {
    path: "/",
    file: "routes/connections/connections.route.tsx",
  },
  {
    path: ":id/*",
    file: "routes/objects/objects.route.tsx",
  },
  {
    path: "/recent",
    file: "routes/recent/recent.route.tsx",
  },
  {
    path: "/favorites",
    file: "routes/favorites/favorites.route.tsx",
  },
  {
    path: "/config",
    file: "routes/config.route.tsx",
  },
  {
    path: "/plugin/*",
    file: "routes/plugin/plugin.$.tsx",
  },
  {
    path: "/agent/describe",
    file: "routes/agent/describe.route.tsx",
  },
];

/** Admin routes — scope-gated via adminMiddleware, wrapped in the admin layout. */
const orgAdminRoutes = [
  layout("routes/layouts/admin.layout.tsx", [
    {
      path: "/admin/users",
      file: "routes/admin/users/users.route.tsx",
      children: [
        {
          path: "invite",
          file: "routes/admin/inviteUser/inviteUser.modal.tsx",
        },
        {
          path: "bulk-invite",
          file: "routes/admin/bulkInvite/bulkInvite.modal.tsx",
        },
        {
          path: "create-group",
          file: "routes/admin/createGroup/createGroup.modal.tsx",
        },
        {
          path: ":userId",
          file: "routes/admin/updateUser/updateUser.modal.tsx",
        },
      ],
    },
  ]),
];

/**
 * Data endpoints — authenticated, no layout (JSON responses). Org-scoped
 * browser endpoints live under `/api/v1/:org/...` (the URL drives the org,
 * membership-validated by authMiddleware); machine clients (CLI, Cyberduck,
 * broker, admin-portal) resolve the org from their own single-org tokens and
 * keep their un-prefixed paths.
 */
const apiRoutes = [
  {
    path: "/api/v1/:org/cyberduck-profile/:id",
    file: "routes/api/cyberduck-profile.$id.ts",
  },
  {
    path: "/api/v1/:org/provider-catalog",
    file: "routes/api/provider-catalog.ts",
  },
  {
    path: "/api/v1/:org/bucket-catalog",
    file: "routes/api/bucket-catalog.ts",
  },
  // One file, two mounts: org-scoped session endpoints under /api/v1/:org,
  // org-agnostic carve-outs under /api/plugin. Distinct ids or RR rejects the
  // duplicate.
  route("/api/v1/:org/plugin/*", "routes/api/plugin.$.ts", {
    id: "routes/api/plugin-org.$",
  }),
  route("/api/plugin/*", "routes/api/plugin.$.ts", {
    id: "routes/api/plugin-agnostic.$",
  }),
  {
    path: "/api/broker",
    file: "routes/api/broker.ts",
  },
  {
    path: "/api/job-grant/callback",
    file: "routes/api/job-grant/callback.ts",
  },
  {
    path: "/api/v1/:org/job-grant/initiate",
    file: "routes/api/job-grant/initiate.ts",
  },
  {
    path: "/api/connections",
    file: "routes/api/connections.ts",
  },
  {
    path: "/api/me/connections",
    file: "routes/api/me.connections.ts",
  },
];

export default [
  ...authRoutes,
  ...apiRoutes,
  layout("routes/layouts/protected.layout.tsx", [
    layout("routes/layouts/org.layout.tsx", [
      ...prefix("/:org", [...orgAppRoutes, ...orgAdminRoutes]),
    ]),
    // The bare root redirects to the default org (auth first: an
    // unauthenticated visit takes the login redirect, not a 200 shell).
    route("/", "routes/rootRedirect.route.ts"),
  ]),

  {
    path: "*",
    file: "routes/fallback.route.tsx",
  },
] satisfies RouteConfig;
