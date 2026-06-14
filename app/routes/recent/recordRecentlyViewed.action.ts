import { ActionFunctionArgs } from "react-router";

import { recordViewedSchema } from "./recent.schema";
import { upsertRecentlyViewed } from "./recent.server";
import { guardConnectionAction } from "~/utils/actionGuard";

export const recordRecentlyViewed = (args: ActionFunctionArgs) =>
  guardConnectionAction({
    args,
    schema: recordViewedSchema,
    errorLabel: "[recent] Failed to upsert:",
    handler: (data, _connection, user) => upsertRecentlyViewed(user.sub, data),
  });
