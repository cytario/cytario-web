import { createContext, redirect, type MiddlewareFunction } from "react-router";

import { getSessionData } from "./getSession";
import { getAllSessionCredentials } from "./getSessionCredentials";
import { toIdentity } from "./getUserInfo";
import { withHostRequestContext } from "../hostRequestContext";
import { refreshAccessTokenWithLock } from "./refreshAuthTokens";
import { sessionContext } from "./sessionMiddleware";
import { type CytarioSession, type SessionData, sessionStorage } from "./sessionStorage";
import { verifyIdToken } from "./verifyIdToken";
import { ConnectionConfig, ConnectionGrant } from "~/.generated/client";
import type { ClientConnectionProvider } from "~/.server/auth/getSessionCredentials";
import { createLabel } from "~/.server/logging";
import { runGates } from "~/.server/pluginGates";
import { listConnections } from "~/routes/connections/connections.server";

export type ConnectionConfigWithGrants = ConnectionConfig & { grants: ConnectionGrant[] };

export interface AuthContextData extends SessionData {
  connectionConfigs: ConnectionConfigWithGrants[];
  credentialErrors: Record<string, string>;
  connectionProviders: Record<string, ClientConnectionProvider>;
}

export const authContext = createContext<AuthContextData>();

// Buffers beyond the id token's 30s verification tolerance so a token is never
// forwarded to the portal token exchange or AWS STS (both validate exp strictly).
const ACCESS_TOKEN_FRESHNESS_BUFFER_SECONDS = 60;

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

const tokenTtlSeconds = (token?: string): number => {
  if (!token) return 0;

  try {
    const payload = token.split(".")[1];
    const decoded = JSON.parse(atob(payload));
    if (typeof decoded.exp !== "number") return 0;
    return decoded.exp - Math.floor(Date.now() / 1000);
  } catch {
    return 0;
  }
};

// The downstream consumers (portal exchange, AWS STS) validate exp strictly,
// unlike verifyIdToken's 30s clock tolerance; the buffer closes that window.
const isTokenFresherThan = (token: string | undefined, bufferSeconds: number): boolean =>
  tokenTtlSeconds(token) >= bufferSeconds;

const isComplete = (data: Partial<SessionData>): boolean => {
  return !!(data.user && data.authTokens);
};

const label = createLabel("authorize", "green");

const fetchAllCredentials = async (
  sessionData: SessionData,
): Promise<{
  sessionData: SessionData;
  connectionConfigs: ConnectionConfigWithGrants[];
  credentialErrors: Record<string, string>;
  connectionProviders: Record<string, ClientConnectionProvider>;
}> => {
  const connectionConfigs = await listConnections(sessionData.user);

  const { credentials, errors, providers } = await getAllSessionCredentials(
    sessionData,
    connectionConfigs,
  );

  return {
    sessionData: {
      ...sessionData,
      credentials,
    },
    connectionConfigs,
    credentialErrors: errors,
    connectionProviders: providers,
  };
};

export const authMiddleware: MiddlewareFunction = async ({ request, url, context }, next) => {
  console.info(`${label} ${request.method} ${request.url}`);

  const session = context.get(sessionContext);

  if (!session) {
    throw new Error("Session not found in context. Ensure sessionMiddleware runs first.");
  }

  const sessionData = await getSessionData(session);

  if (isComplete(sessionData)) {
    let updatedSessionData = sessionData as SessionData;
    const { authTokens, user } = updatedSessionData;

    // Gates run before any ConnectionConfig query so a zero-org or gated session
    // cannot fall through to an unscoped tenant read; gates receive only the
    // PII-free identity projection.
    const outcome = await runGates({
      url: url.toString(),
      method: request.method,
      identity: toIdentity(user),
    });

    if (outcome.kind === "redirect") {
      console.info(`${label} Gate redirect to ${outcome.url}`);
      return redirect(outcome.url);
    }

    if (outcome.kind === "deny") {
      const status = outcome.status ?? 403;
      console.info(`${label} Gate denied request with status ${status}`);
      return new Response(JSON.stringify({ error: outcome.message ?? "Request denied" }), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!user.organization) {
      console.info(`${label} No active organization on session, redirecting to onboarding`);
      return redirect("/onboarding");
    }

    const idTokenPayload = isTokenFresherThan(
      authTokens.accessToken,
      ACCESS_TOKEN_FRESHNESS_BUFFER_SECONDS,
    )
      ? await verifyIdToken(authTokens.idToken)
      : null;

    if (idTokenPayload) {
      const {
        sessionData: withCredentials,
        connectionConfigs,
        credentialErrors,
        connectionProviders,
      } = await fetchAllCredentials(updatedSessionData);
      updatedSessionData = withCredentials;

      if (updatedSessionData.credentials !== sessionData.credentials) {
        session.set("credentials", updatedSessionData.credentials);
        await sessionStorage.commitSession(session);
      }

      context.set(authContext, {
        ...updatedSessionData,
        connectionConfigs,
        credentialErrors,
        connectionProviders,
      });
      return withHostRequestContext(
        {
          user: updatedSessionData.user,
          identity: toIdentity(user),
          authTokens: updatedSessionData.authTokens,
          sessionId: session.id,
        },
        () => next(),
      );
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

        const {
          sessionData: withCredentials,
          connectionConfigs,
          credentialErrors,
          connectionProviders,
        } = await fetchAllCredentials({
          ...updatedSessionData,
          authTokens: newAuthTokens,
        });
        updatedSessionData = withCredentials;

        session.set("credentials", updatedSessionData.credentials);
        await sessionStorage.commitSession(session);

        context.set(authContext, {
          ...updatedSessionData,
          connectionConfigs,
          credentialErrors,
          connectionProviders,
        });
        return withHostRequestContext(
          {
            user: updatedSessionData.user,
            identity: toIdentity(updatedSessionData.user),
            authTokens: updatedSessionData.authTokens,
            sessionId: session.id,
          },
          () => next(),
        );
      }
    }
  }

  return logout(url, session);
};

// Return the redirect rather than throwing it: under RR's middleware single-fetch
// path a thrown redirect Response is caught and re-encoded as a 500, which
// surfaces as `SingleFetchNoResultError` in the root ErrorBoundary.
const logout = async (url: URL, session: CytarioSession): Promise<Response> => {
  console.info(`${label} Delete session and redirect to login`);
  const relativeUrl = url.pathname + url.search;
  return redirect(`/login?redirect=${encodeURIComponent(relativeUrl)}`, {
    headers: {
      "Set-Cookie": await sessionStorage.destroySession(session),
    },
  });
};
