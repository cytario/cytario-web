import { createContext, redirect, type MiddlewareFunction } from "react-router";

import { getSessionData } from "./getSession";
import { getAllSessionCredentials } from "./getSessionCredentials";
import { refreshAccessTokenWithLock } from "./refreshAuthTokens";
import { sessionContext } from "./sessionMiddleware";
import { type CytarioSession, type SessionData, sessionStorage } from "./sessionStorage";
import { verifyIdToken } from "./verifyIdToken";
import { ConnectionConfig } from "~/.generated/client";
import { createLabel } from "~/.server/logging";
import { listConnections } from "~/routes/connections/connections.server";

export interface AuthContextData extends SessionData {
  connectionConfigs: ConnectionConfig[];
}

export const authContext = createContext<AuthContextData>();

const isRefreshTokenValid = (token?: string): boolean => {
  if (!token) return false;

  try {
    const payload = token.split(".")[1];
    const decoded = JSON.parse(atob(payload));
    return Math.floor(Date.now() / 1000) < decoded.exp;
  } catch {
    return false;
  }
};

const isComplete = (data: Partial<SessionData>): boolean => {
  return !!(data.user && data.authTokens);
};

const label = createLabel("authorize", "green");

const fetchAllCredentials = async (
  sessionData: SessionData,
): Promise<{ sessionData: SessionData; connectionConfigs: ConnectionConfig[] }> => {
  const connectionConfigs = await listConnections(sessionData.user);

  const newCredentials = await getAllSessionCredentials(sessionData, connectionConfigs);

  return {
    sessionData: {
      ...sessionData,
      credentials: newCredentials,
    },
    connectionConfigs,
  };
};

export const authMiddleware: MiddlewareFunction = async ({ request, context }, next) => {
  console.info(`${label} ${request.method} ${request.url}`);

  const session = context.get(sessionContext);

  if (!session) {
    throw new Error("Session not found in context. Ensure sessionMiddleware runs first.");
  }

  const sessionData = await getSessionData(session);

  if (isComplete(sessionData)) {
    let updatedSessionData = sessionData as SessionData;
    const { authTokens } = updatedSessionData;

    const idTokenPayload = await verifyIdToken(authTokens.idToken);

    if (idTokenPayload) {
      const { sessionData: withCredentials, connectionConfigs } =
        await fetchAllCredentials(updatedSessionData);
      updatedSessionData = withCredentials;

      if (updatedSessionData.credentials !== sessionData.credentials) {
        session.set("credentials", updatedSessionData.credentials);
        await sessionStorage.commitSession(session);
      }

      context.set(authContext, { ...updatedSessionData, connectionConfigs });
      return next();
    }

    if (isRefreshTokenValid(authTokens.refreshToken)) {
      console.info(`${label} Fetch new tokens and credentials`);

      let newAuthTokens;
      try {
        newAuthTokens = await refreshAccessTokenWithLock(session.id, authTokens.refreshToken);
      } catch (error) {
        console.error(`${label} Token refresh failed:`, error);
      }

      if (newAuthTokens) {
        session.set("authTokens", newAuthTokens);

        const { sessionData: withCredentials, connectionConfigs } = await fetchAllCredentials({
          ...updatedSessionData,
          authTokens: newAuthTokens,
        });
        updatedSessionData = withCredentials;

        session.set("credentials", updatedSessionData.credentials);
        await sessionStorage.commitSession(session);

        context.set(authContext, { ...updatedSessionData, connectionConfigs });
        return next();
      }
    }
  }

  return logout(request.url, session);
};

// Return the redirect rather than throwing it: under RR's middleware single-fetch
// path a thrown redirect Response is caught and re-encoded as a 500, which
// surfaces as `SingleFetchNoResultError` in the root ErrorBoundary.
const logout = async (url: string, session: CytarioSession): Promise<Response> => {
  console.info(`${label} Delete session and redirect to login`);
  const requestUrl = new URL(url);
  const relativeUrl = requestUrl.pathname + requestUrl.search;
  return redirect(`/login?redirect=${encodeURIComponent(relativeUrl)}`, {
    headers: {
      "Set-Cookie": await sessionStorage.destroySession(session),
    },
  });
};
