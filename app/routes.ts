import { type RouteConfig, layout } from "@react-router/dev/routes";

// Splat routes can't have working child routes (the * is greedy and swallows
// child path segments). Instead, generate one entry per scope depth so React
// Router can match the literal "invite"/"user" children correctly. Increase
// MAX_SCOPE_DEPTH if your group hierarchy needs more levels.
const MAX_SCOPE_DEPTH = 4;

const adminModalChildren = (depth: number) => [
  {
    id: `admin-depth-${depth}-invite`,
    path: "invite",
    file: "routes/admin/inviteUser/inviteUser.modal.tsx",
  },
  {
    id: `admin-depth-${depth}-user`,
    path: "user/:userId",
    file: "routes/admin/updateUser/updateUser.modal.tsx",
  },
];

const adminRoutes = Array.from({ length: MAX_SCOPE_DEPTH }, (_, i) => {
  const depth = i + 1;
  const scopePath = Array.from({ length: depth }, (_, j) => `:s${j}`).join("/");
  return {
    id: `admin-depth-${depth}`,
    path: `/admin/${scopePath}`,
    file: "routes/admin/admin.route.tsx",
    children: adminModalChildren(depth),
  };
});

const publicRoutes = [
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

const protectedRoutes = [
  // wrap in scroll view route layout
  layout("routes/layouts/scrollview.layout.tsx", [
    {
      path: "/",
      file: "routes/buckets/buckets.route.tsx",
      children: [
        {
          path: "connect-bucket",
          file: "routes/buckets/connectBucket.modal.tsx",
        },
      ],
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
      path: "/buckets/:provider/:bucketName/*",
      file: "routes/objects.route.tsx",
    },
    ...adminRoutes,
  ]),
];

const apiRoutes = [
  {
    path: "/api/cyberduck-profile/:provider/:bucketName",
    file: "routes/api/cyberduck-profile.$bucketName.ts",
  },
  {
    path: "/presign/:provider/:bucketName/*",
    file: "routes/presign.route.tsx",
  },
];

export default [
  ...publicRoutes,
  ...protectedRoutes,
  ...apiRoutes,

  {
    path: "*",
    file: "routes/fallback.route.tsx",
  },
] satisfies RouteConfig;
