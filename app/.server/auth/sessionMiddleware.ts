import { createContext, MiddlewareFunction } from "react-router";

import { getSession } from "./getSession";
import { type CytarioSession } from "./sessionStorage";

export const sessionContext = createContext<CytarioSession>();

/**
 * Middleware that retrieves the session from the request
 * and sets it in the context for downstream use.
 */
export const sessionMiddleware: MiddlewareFunction = async (
  { request, context },
  next
) => {
  const session = await getSession(request);
  context.set(sessionContext, session);
  return next();
};
