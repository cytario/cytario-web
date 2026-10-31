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

/** Data endpoints — authenticated, no layout (JSON responses). Org comes from the session. */
const apiRoutes = [
  {
    path: "/api/cyberduck-profile/:id",
    file: "routes/api/cyberduck-profile.$id.ts",
  },
  {
    path: "/api/provider-catalog",
    file: "routes/api/provider-catalog.ts",
  },
  {
    path: "/api/bucket-catalog",
    file: "routes/api/bucket-catalog.ts",
  },
  {
    path: "/api/plugin/*",
    file: "routes/api/plugin.$.ts",
  },
  {
    path: "/api/broker",
    file: "routes/api/broker.ts",
  },
  {
    path: "/api/job-grant/callback",
    file: "routes/api/job-grant/callback.ts",
  },
  {
    path: "/api/job-grant/initiate",
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

/**
 * Un-prefixed app URLs predate the org-first scheme: bookmarks, docs and
 * plugin links still carry them. Each moved route root gets its own wildcard
 * so the redirect answers only for paths that actually moved — anything else
 * keeps falling through to the 404 fallback instead of bouncing. They sit
 * inside the protected layout because the target org comes from the session.
 */
const legacyFile = "routes/layouts/legacyRedirect.layout.ts";

// One file, several routes: each needs its own id or RR rejects the duplicate.
const legacyRoute = (path: string) =>
  route(path, legacyFile, { id: `routes/layouts/legacyRedirect${path.replace(/[/*]/g, "-")}` });

const legacyRedirectRoutes = [
  legacyRoute("/"),
  legacyRoute("/recent/*"),
  legacyRoute("/favorites/*"),
  legacyRoute("/config/*"),
  legacyRoute("/connections/*"),
  legacyRoute("/plugin/*"),
  legacyRoute("/agent/*"),
  legacyRoute("/admin/*"),
];

export default [
  ...authRoutes,
  ...apiRoutes,
  layout("routes/layouts/protected.layout.tsx", [
    layout("routes/layouts/org.layout.tsx", [
      ...prefix("/:org", [...orgAppRoutes, ...orgAdminRoutes]),
    ]),
    ...legacyRedirectRoutes,
  ]),

  {
    path: "*",
    file: "routes/fallback.route.tsx",
  },
] satisfies RouteConfig;
