import { ActionFunctionArgs } from "react-router";

import { addFavoriteSchema } from "./favorites.schema";
import { addFavorite } from "./favorites.server";
import { guardConnectionAction } from "~/utils/actionGuard";

export const addFavoriteAction = (args: ActionFunctionArgs) =>
  guardConnectionAction({
    args,
    schema: addFavoriteSchema,
    errorLabel: "[favorites] Failed to add favorite:",
    handler: (data, connection, user) =>
      addFavorite(user.sub, {
        ...data,
        connectionId: connection.id,
        connectionName: connection.name,
      }),
  });
