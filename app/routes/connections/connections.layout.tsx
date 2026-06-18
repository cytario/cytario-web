import { type ActionFunctionArgs, Outlet } from "react-router";

import { createAction } from "./createConnection.action";
import { deleteAction } from "./deleteConnection.action";
import { updateAction } from "./updateConnection.action";
import { buildVirtualNode } from "~/utils/treeNodeFactories";

export const handle = {
  node: () => buildVirtualNode("Connections", []),
};

// Connection CRUD resolves to this route; keep its response uncached (carries
// connection config) — preserves the guard the action's old route had.
export const headers = () => ({ "Cache-Control": "no-store, private" });

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
