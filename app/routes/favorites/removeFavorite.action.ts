import { ActionFunctionArgs } from "react-router";

import { removeFavoriteSchema } from "./favorites.schema";
import { removeFavorite } from "./favorites.server";
import { guardConnectionAction } from "~/utils/actionGuard";

export const removeFavoriteAction = (args: ActionFunctionArgs) =>
  guardConnectionAction({
    args,
    schema: removeFavoriteSchema,
    errorLabel: "[favorites] Failed to remove favorite:",
    handler: (data, _connection, user) =>
      removeFavorite(user.sub, data.connectionName, data.pathName),
  });
