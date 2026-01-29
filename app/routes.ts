import { type RouteConfig, layout } from "@react-router/dev/routes";

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
  ]),
  {
    path: "/buckets/:provider/:bucketName/*",
    file: "routes/objects.route.tsx",
  },
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
