import { type RouteConfig, layout } from "@react-router/dev/routes";

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
];

/** Main application routes — authenticated, wrapped in scrollview layout. */
const appRoutes = [
  {
    path: "/",
    file: "routes/home/home.route.tsx",
  },
  {
    path: "/recent",
    file: "routes/recent.route.tsx",
  },
  {
    path: "/search",
    file: "routes/search.route.tsx",
  },
  {
    path: "/config",
    file: "routes/config.route.tsx",
  },
  {
    path: "/connections",
    file: "routes/connections/connections.route.tsx",
  },
  {
    path: "/connections/:name/*",
    file: "routes/objects.route.tsx",
  },
];

/** Admin routes — scope-gated, wrapped in scrollview layout alongside appRoutes. */
const adminRoutes = [
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
];

/** Data endpoints — authenticated, no layout (JSON responses). */
const apiRoutes = [
  {
    path: "/api/cyberduck-profile/:name",
    file: "routes/api/cyberduck-profile.$name.ts",
  },
  {
    path: "/api/recently-viewed",
    file: "routes/api/recently-viewed.ts",
  },
  {
    path: "/api/pinned",
    file: "routes/api/pinned.ts",
  },
  {
    path: "/api/reindex/:name",
    file: "routes/api/reindex.$name.ts",
  },
  {
    path: "/api/index-status/:name",
    file: "routes/api/index-status.$name.ts",
  },
  {
    path: "/presign/:name/*",
    file: "routes/presign.route.tsx",
  },
];

export default [
  ...authRoutes,
  layout("routes/layouts/scrollview.layout.tsx", [
    ...appRoutes,
    ...adminRoutes,
  ]),
  ...apiRoutes,

  {
    path: "*",
    file: "routes/fallback.route.tsx",
  },
] satisfies RouteConfig;
