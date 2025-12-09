import { createContext, redirect, type MiddlewareFunction } from "react-router";

import { getSessionData } from "./getSession";
import { getSessionCredentials } from "./getSessionCredentials";
import { refreshAccessToken as refreshAuthTokens } from "./refreshAuthTokens";
import { sessionContext } from "./sessionMiddleware";
import {
  type CytarioSession,
  type SessionData,
  sessionStorage,
} from "./sessionStorage";
import { createLabel } from "~/.server/logging";

export const authContext = createContext<Partial<SessionData>>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const decodeToken = (token: string): Record<string, any> => {
  const payload = token.split(".")[1];
  return JSON.parse(atob(payload));
};

const isValidToken = (token?: string): boolean => {
  if (!token) return false;

  try {
    const decodedPayload = decodeToken(token);
    return Math.floor(Date.now() / 1000) < decodedPayload.exp;
  } catch {
    return false;
  }
};

const isValidCredentials = (credentials?: { Expiration?: Date }): boolean => {
  if (!credentials?.Expiration) return false;

  // Check if credentials are expired (with 5 minute buffer)
  const bufferMs = 5 * 60 * 1000; // 5 minutes
  return Date.now() < new Date(credentials.Expiration).getTime() - bufferMs;
};

const isComplete = (data: Partial<SessionData>): boolean => {
  return !!(data.user && data.authTokens);
};

const label = createLabel("authorize", "green");

/**
 * Middleware that validates and refreshes authentication tokens.
 * Sets validated session data in authContext for downstream use.
 * Export this from protected routes that require authentication.
 */
export const authMiddleware: MiddlewareFunction = async (
  { request, params, context },
  next
) => {
  console.info(`${label} Request: ${request.url}`);

  const session = context.get(sessionContext);

  if (!session) {
    throw new Error(
      "Session not found in context. Ensure sessionMiddleware runs first."
    );
  }

  const { provider, bucketName } = params;

  const sessionData = await getSessionData(session);

  if (isComplete(sessionData)) {
    let updatedSessionData = sessionData as SessionData;
    const { authTokens, credentials } = updatedSessionData;

    // If idToken is valid, proceed
    if (isValidToken(authTokens.idToken)) {
      // Fetch credentials for bucket if not present or expired
      if (bucketName && !isValidCredentials(credentials[bucketName])) {
        console.info(
          `${label} Fetch temporary credentials for bucket "${provider}/${bucketName}"`
        );

        const newCredentials = await getSessionCredentials(
          updatedSessionData,
          provider,
          bucketName
        );

        updatedSessionData = {
          ...updatedSessionData,
          credentials: newCredentials,
        };

        session.set("credentials", updatedSessionData.credentials);
        await sessionStorage.commitSession(session);
      }

      // Token is valid, set auth data and continue
      context.set(authContext, updatedSessionData);
      return next();
    }

    // If idToken is invalid but refreshToken is valid, refresh tokens
    if (isValidToken(authTokens.refreshToken)) {
      console.info(`${label} Fetch new tokens and credentials`);

      const newAuthTokens = await refreshAuthTokens(authTokens.refreshToken);
      session.set("authTokens", newAuthTokens);

      // Fetch new credentials with refreshed tokens
      const newCredentials = await getSessionCredentials(
        { ...updatedSessionData, authTokens: newAuthTokens },
        provider,
        bucketName
      );

      updatedSessionData = {
        ...updatedSessionData,
        authTokens: newAuthTokens,
        credentials: newCredentials,
      };

      // Set updated auth data and continue
      await sessionStorage.commitSession(session);
      context.set(authContext, updatedSessionData);
      return next();
    }
  }

  // Neither token is valid, logout
  await logout(request.url, session);
};

/**
 * Logs out the user by destroying the session and redirecting to the login page.
 * @param url Current request URL for redirect after login
 * @param session Cytario session to destroy
 * @throws Redirect to login page
 */
const logout = async (url: string, session: CytarioSession) => {
  console.info(`${label} Delete session and redirect to login`);
  throw redirect(`/login?redirect=${encodeURIComponent(url)}`, {
    headers: {
      "Set-Cookie": await sessionStorage.destroySession(session),
    },
  });
};
