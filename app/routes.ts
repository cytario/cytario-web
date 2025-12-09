import { type RouteConfig } from "@react-router/dev/routes";

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
    path: "/buckets/:provider/:bucketName/*",
    file: "routes/objects.route.tsx",
  },
  {
    path: "/search",
    file: "routes/search.route.tsx",
  },
  {
    path: "/config",
    file: "routes/config.route.tsx",
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
