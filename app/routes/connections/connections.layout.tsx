import { type ActionFunctionArgs, Outlet } from "react-router";

import { createAction } from "./createConnection.action";
import { deleteAction } from "./deleteConnection.action";
import { updateAction } from "./updateConnection.action";

// Breadcrumb-bearing parent so the `Connections` root crumb propagates to the
// list (index) and to deep object routes alike.
export const handle = {
  breadcrumb: () => ({ label: "Connections", to: "/connections" }),
};

// Connection CRUD submits target `/connections`, which resolves to this layout
// route — so the action lives here, not on the index route.
export const action = async (args: ActionFunctionArgs) => {
  switch (args.request.method.toUpperCase()) {
    case "POST":
      return createAction(args);
    case "DELETE":
      return deleteAction(args);
    case "PATCH":
      return updateAction(args);
    default:
      return new Response("Method not allowed", { status: 405 });
  }
};

export default function ConnectionsLayout() {
  return <Outlet />;
}
