import { CytarioSession, sessionStorage } from "./sessionStorage";

/**
 * Retrieves the Cytario session from the request.
 * @deprecated For routes under the auth middleware chain, use `context.get(sessionContext)` instead.
 * Direct use in auth routes (login, callback, logout) that run outside middleware is acceptable.
 */
export const getSession = async (request: Request): Promise<CytarioSession> => {
  const cookie = request.headers.get("cookie");
  try {
    return await sessionStorage.getSession(cookie);
  } catch (error) {
    console.error("getSession failed:", error);
    throw error;
  }
};

export const getSessionData = async (session: CytarioSession) => {
  const user = session.get("user");
  const authTokens = session.get("authTokens");
  const credentials = session.get("credentials") || {};
  const notification = session.get("notification");
  return { user, authTokens, credentials, notification };
};
