import { createContext, redirect, type MiddlewareFunction } from "react-router";

import { getSessionData } from "./getSession";
import { getAllSessionCredentials } from "./getSessionCredentials";
import { refreshAccessToken as refreshAuthTokens } from "./refreshAuthTokens";
import { sessionContext } from "./sessionMiddleware";
import {
  type CytarioSession,
  type SessionData,
  sessionStorage,
} from "./sessionStorage";
import { BucketConfig } from "~/.generated/client";
import { createLabel } from "~/.server/logging";
import { getBucketConfigs } from "~/utils/bucketConfig";

export interface AuthContextData extends SessionData {
  bucketConfigs: BucketConfig[];
}

export const authContext = createContext<AuthContextData>();

// TODO: use library
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

const isComplete = (data: Partial<SessionData>): boolean => {
  return !!(data.user && data.authTokens);
};

const label = createLabel("authorize", "green");

/**
 * Fetches all bucket configs and credentials for the user.
 * Only fetches credentials for buckets with missing or expired credentials.
 * Returns updated session data and bucket configs.
 */
const fetchAllCredentials = async (
  sessionData: SessionData,
): Promise<{ sessionData: SessionData; bucketConfigs: BucketConfig[] }> => {
  const bucketConfigs = await getBucketConfigs(sessionData.user);

  const newCredentials = await getAllSessionCredentials(
    sessionData,
    bucketConfigs,
  );

  return {
    sessionData: {
      ...sessionData,
      credentials: newCredentials,
    },
    bucketConfigs,
  };
};

/**
 * Middleware that validates and refreshes authentication tokens.
 * Fetches bucket configs and credentials for all visible buckets.
 * Sets validated session data in authContext for downstream use.
 * Export this from protected routes that require authentication.
 */
export const authMiddleware: MiddlewareFunction = async (
  { request, context },
  next,
) => {
  console.info(`${label} Request: ${request.url}`);

  const session = context.get(sessionContext);

  if (!session) {
    throw new Error(
      "Session not found in context. Ensure sessionMiddleware runs first.",
    );
  }

  const sessionData = await getSessionData(session);

  if (isComplete(sessionData)) {
    let updatedSessionData = sessionData as SessionData;
    const { authTokens } = updatedSessionData;

    // If idToken is valid, proceed
    if (isValidToken(authTokens.idToken)) {
      const { sessionData: withCredentials, bucketConfigs } =
        await fetchAllCredentials(updatedSessionData);
      updatedSessionData = withCredentials;

      // Only commit session if credentials changed
      if (updatedSessionData.credentials !== sessionData.credentials) {
        session.set("credentials", updatedSessionData.credentials);
        await sessionStorage.commitSession(session);
      }

      context.set(authContext, { ...updatedSessionData, bucketConfigs });
      return next();
    }

    // If idToken is invalid but refreshToken is valid, refresh tokens
    if (isValidToken(authTokens.refreshToken)) {
      console.info(`${label} Fetch new tokens and credentials`);

      const newAuthTokens = await refreshAuthTokens(authTokens.refreshToken);
      session.set("authTokens", newAuthTokens);

      const { sessionData: withCredentials, bucketConfigs } =
        await fetchAllCredentials({
          ...updatedSessionData,
          authTokens: newAuthTokens,
        });
      updatedSessionData = withCredentials;

      session.set("credentials", updatedSessionData.credentials);
      await sessionStorage.commitSession(session);

      context.set(authContext, { ...updatedSessionData, bucketConfigs });
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
