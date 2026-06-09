import { Outlet } from "react-router";

// Breadcrumb-bearing parent so the `Connections` root crumb propagates to the
// list (index) and to deep object routes alike.
export const handle = {
  breadcrumb: () => ({ label: "Connections", to: "/connections" }),
};

export default function ConnectionsLayout() {
  return <Outlet />;
}
