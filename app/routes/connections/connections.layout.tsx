import { type ActionFunctionArgs, Outlet } from "react-router";

import { createAction } from "./createConnection.action";
import { deleteAction } from "./deleteConnection.action";
import { reapplyAction } from "./reapplyConnection.action";
import { shareAction } from "./shareFolder.action";
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
  const method = args.request.method.toUpperCase();
  if (method === "DELETE") return deleteAction(args);
  if (method === "PATCH") return updateAction(args);
  if (method !== "POST") return new Response("Method not allowed", { status: 405 });

  // Peek the intent on a clone so the handler can still read the body once.
  const intent = (await args.request.clone().formData()).get("_intent");
  switch (intent) {
    case "share":
      return shareAction(args);
    case "reapply":
      return reapplyAction(args);
    default:
      return createAction(args);
  }
};

export default function ConnectionsLayout() {
  return <Outlet />;
}
