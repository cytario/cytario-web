import { Outlet } from "react-router";

import { adminMiddleware } from "~/.server/auth/adminMiddleware";

export const middleware = [adminMiddleware];

export default function AdminLayout() {
  return <Outlet />;
}
