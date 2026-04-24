import { ActionFunctionArgs } from "react-router";

import { connectionIndexCreate } from "./connectionIndexCreate";
import { connectionIndexUpdate } from "./connectionIndexUpdate";

/**
 * Dispatcher for `/connectionIndex/:connectionName`.
 *
 * - POST  → connectionIndexCreate (full rebuild, redirects to /connections/:name)
 * - PATCH → connectionIndexUpdate (slice patch, returns JSON)
 */
export const action = async (args: ActionFunctionArgs) => {
  switch (args.request.method.toUpperCase()) {
    case "POST":
      return connectionIndexCreate(args);
    case "PATCH":
      return connectionIndexUpdate(args);
    default:
      return new Response("Method not allowed", { status: 405 });
  }
};
