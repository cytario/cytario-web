import { CytarioSession, sessionStorage } from "./sessionStorage";

/**
 * Retrieves the Cytario session from the request.
 * @deprecated use middleware context instead to prevent multiple session reads per request
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
