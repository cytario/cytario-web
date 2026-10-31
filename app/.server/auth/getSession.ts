import {
  CytarioSession,
  type ConnectionsCredentials,
  type SessionData,
  sessionStorage,
} from "./sessionStorage";

/**
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

export type SessionSnapshot = Partial<SessionData> & { credentials: ConnectionsCredentials };

export const getSessionData = async (session: CytarioSession): Promise<SessionSnapshot> => {
  const user = session.get("user");
  const activeOrganization = session.get("activeOrganization");
  const authTokens = session.get("authTokens");
  const credentials = session.get("credentials") || {};
  const notification = session.get("notification");
  return { user, activeOrganization, authTokens, credentials, notification };
};
