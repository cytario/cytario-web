import { createContext, redirect, type MiddlewareFunction } from "react-router";

import { getSessionData } from "./getSession";
import { getSessionCredentials } from "./getSessionCredentials";
import { refreshAccessTokenWithLock } from "./refreshAuthTokens";
import { sessionContext } from "./sessionMiddleware";
import {
  type CytarioSession,
  type SessionData,
  sessionStorage,
} from "./sessionStorage";
import { verifyIdToken } from "./verifyIdToken";
import { createLabel } from "~/.server/logging";

export const authContext = createContext<Partial<SessionData>>();

/**
 * Lightweight expiry check for refresh tokens (opaque to clients).
 * Only checks the `exp` claim — no signature verification needed.
 */
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
  next,
) => {
  console.info(`${label} Request: ${request.url}`);

  const session = context.get(sessionContext);

  if (!session) {
    throw new Error(
      "Session not found in context. Ensure sessionMiddleware runs first.",
    );
  }

  const { provider, bucketName } = params;
  const pathName = params["*"];

  const sessionData = await getSessionData(session);

  if (isComplete(sessionData)) {
    let updatedSessionData = sessionData as SessionData;
    const { authTokens, credentials } = updatedSessionData;

    // Verify idToken signature via JWKS
    const idTokenPayload = await verifyIdToken(authTokens.idToken);

    if (idTokenPayload) {
      // Fetch credentials for bucket if not present or expired
      if (bucketName && !isValidCredentials(credentials[bucketName])) {
        console.info(
          `${label} Fetch temporary credentials for bucket "${provider}/${bucketName}"`,
        );

        try {
          const newCredentials = await getSessionCredentials(
            updatedSessionData,
            provider,
            bucketName,
            pathName,
          );

          updatedSessionData = {
            ...updatedSessionData,
            credentials: newCredentials,
          };

          session.set("credentials", updatedSessionData.credentials);
        } catch (error) {
          console.error(
            `${label} Failed to fetch credentials for bucket "${provider}/${bucketName}":`,
            error,
          );
          session.set("notification", {
            status: "error",
            message: `Unable to access bucket "${bucketName}". Temporary credentials could not be obtained.`,
          });
        }

        const setCookieHeader = await sessionStorage.commitSession(session);
        context.set(authContext, updatedSessionData);
        const response = (await next()) as Response;
        response.headers.append("Set-Cookie", setCookieHeader);
        return response;
      }

      // Token is valid, set auth data and continue
      context.set(authContext, updatedSessionData);
      return next();
    }

    // If idToken is invalid but refreshToken is valid, refresh tokens
    if (isRefreshTokenValid(authTokens.refreshToken)) {
      console.info(`${label} Fetch new tokens and credentials`);

      const newAuthTokens = await refreshAccessTokenWithLock(
        session.id,
        authTokens.refreshToken,
      );
      session.set("authTokens", newAuthTokens);

      // Fetch new credentials with refreshed tokens
      try {
        const newCredentials = await getSessionCredentials(
          { ...updatedSessionData, authTokens: newAuthTokens },
          provider,
          bucketName,
          pathName,
        );

        updatedSessionData = {
          ...updatedSessionData,
          authTokens: newAuthTokens,
          credentials: newCredentials,
        };
      } catch (error) {
        console.error(
          `${label} Failed to fetch credentials after token refresh:`,
          error,
        );
        updatedSessionData = {
          ...updatedSessionData,
          authTokens: newAuthTokens,
        };
        if (bucketName) {
          session.set("notification", {
            status: "error",
            message: `Unable to access bucket "${bucketName}". Temporary credentials could not be obtained.`,
          });
        }
      }

      const setCookieHeader = await sessionStorage.commitSession(session);
      context.set(authContext, updatedSessionData);
      const response = (await next()) as Response;
      response.headers.append("Set-Cookie", setCookieHeader);
      return response;
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
  const requestUrl = new URL(url);
  const relativeUrl = requestUrl.pathname + requestUrl.search;
  throw redirect(`/login?redirect=${encodeURIComponent(relativeUrl)}`, {
    headers: {
      "Set-Cookie": await sessionStorage.destroySession(session),
    },
  });
};
