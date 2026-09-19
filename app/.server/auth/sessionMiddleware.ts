import { createContext, MiddlewareFunction } from "react-router";

import { getSession } from "./getSession";
import { type CytarioSession } from "./sessionStorage";

export const sessionContext = createContext<CytarioSession>();

export const sessionMiddleware: MiddlewareFunction = async ({ request, context }, next) => {
  const session = await getSession(request);
  context.set(sessionContext, session);
  return next();
};
