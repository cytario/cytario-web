import { createContext, redirect, type MiddlewareFunction } from "react-router";

import { getSessionData } from "./getSession";
import { getAllSessionCredentials } from "./getSessionCredentials";
import {
  decodeJwtClaims,
  orgEntitlements,
  profileFromTokenClaims,
  resolveActiveOrganization,
  toIdentity,
  type OrgEntitlements,
  type UserProfile,
} from "./getUserInfo";
import { getPreferredOrg, setPreferredOrg } from "./orgPreference.server";
import { withHostRequestContext } from "../hostRequestContext";
import { refreshAccessTokenWithLock } from "./refreshAuthTokens";
import { sessionContext } from "./sessionMiddleware";
import {
  type CytarioSession,
  type ConnectionsCredentials,
  type SessionData,
  sessionStorage,
} from "./sessionStorage";
import { verifyIdToken } from "./verifyIdToken";
import { ConnectionConfig, ConnectionGrant } from "~/.generated/client";
import type { ClientConnectionProvider } from "~/.server/auth/getSessionCredentials";
import { createLabel } from "~/.server/logging";
import { runGates } from "~/.server/pluginGates";
import { listConnections } from "~/routes/connections/connections.server";
import {
  isOrgAgnosticPath,
  orgPath,
  organizationFromApiPath,
  organizationFromPath,
  stripOrgPath,
} from "~/utils/orgPath";

export type ConnectionConfigWithGrants = ConnectionConfig & { grants: ConnectionGrant[] };

export interface AuthContextData extends Omit<SessionData, "credentials"> {
  connectionConfigs: ConnectionConfigWithGrants[];
  credentialErrors: Record<string, string>;
  connectionProviders: Record<string, ClientConnectionProvider>;
  /** Identifies the cached narrow exchange tokens for this request's session. */
  sessionId: string;
  /** The org this request resolved (URL `/:org` or the session default). */
  requestOrganization: string;
  /** The request org's entitlements, derived once per request from the
   * membership map — the profile itself carries no projected copy. */
  entitlements: OrgEntitlements;
  /** THIS request org's credentials — flat connectionId → Credentials; other
   * orgs' credentials never enter the request context. */
  credentials: ConnectionsCredentials;
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

/**
 * Whether a zero-org request is a data/API call: an explicit JSON Accept or a
 * path under the un-prefixed API carve-outs (SRS-CY-31404).
 */
const wantsJsonResponse = (request: Request, pathname: string): boolean => {
  if (pathname.startsWith("/api/")) return true;
  const accept = request.headers.get("accept") ?? "";
  return accept.includes("application/json") && !accept.includes("text/html");
};

const isComplete = (data: Partial<SessionData>): boolean => {
  return !!(data.user && data.authTokens);
};

const label = createLabel("authorize", "green");

/**
 * The default org for a request that names none: the persisted preference,
 * validated against the token's memberships, else the first alias. Derived at
 * use — nothing org-flavored is cached on the session anymore.
 */
const defaultOrganization = async (user: UserProfile): Promise<string | undefined> => {
  if (!user.organizations) return undefined;
  const aliases = Object.keys(user.organizations);
  if (aliases.length === 0) return undefined;
  const preferred = await getPreferredOrg(user.sub).catch((error: unknown) => {
    console.warn(`${label} Org preference lookup failed:`, error);
    return null;
  });
  return resolveActiveOrganization(user.organizations, preferred ?? undefined);
};

const fetchAllCredentials = async (
  sessionData: SessionData,
  sessionId: string,
  organization: string,
): Promise<{
  sessionData: SessionData;
  connectionConfigs: ConnectionConfigWithGrants[];
  credentialErrors: Record<string, string>;
  connectionProviders: Record<string, ClientConnectionProvider>;
}> => {
  const connectionConfigs = await listConnections(sessionData.user, organization);

  const { credentials, errors, providers } = await getAllSessionCredentials(
    sessionData,
    connectionConfigs,
    sessionId,
    organization,
  );

  return {
    sessionData: {
      ...sessionData,
      // Per-org store, identity-preserving when this org's slice is
      // untouched: the middleware's change detection diffs the reference,
      // and a fresh object per call would commit the session every request.
      credentials:
        sessionData.credentials[organization] === credentials
          ? sessionData.credentials
          : {
              ...sessionData.credentials,
              [organization]: credentials,
            },
    },
    connectionConfigs,
    credentialErrors: errors,
    connectionProviders: providers,
  };
};

/**
 * The org this request acts in: the URL's `/:org` segment when it names a
 * membership, else undefined — the caller falls back to the derived default
 * (persisted preference validated against memberships, else first alias). The
 * URL is authoritative; a foreign URL org never reaches the callers (the
 * middleware redirects before any credential work).
 */
const resolveRequestOrganization = (url: URL, user: UserProfile): string | undefined => {
  // Org-scoped API paths carry the org in the segment after /api/v1; page
  // paths carry it first. Both are membership-validated the same way.
  const urlOrg = organizationFromApiPath(url.pathname) ?? organizationFromPath(url.pathname);
  const memberships = user.organizations ?? {};
  if (urlOrg && memberships[urlOrg]) return urlOrg;
  return undefined;
};

interface AuthenticatedRequest {
  context: Parameters<MiddlewareFunction>[0]["context"];
  session: CytarioSession;
  next: Parameters<MiddlewareFunction>[1];
}

/**
 * Runs the plugin gates for the request, before any ConnectionConfig query so a
 * zero-org or gated session cannot fall through to an unscoped tenant read;
 * gates receive only the PII-free identity projection. Returns the gate's
 * redirect/deny response, or undefined to continue.
 */
const applyGates = async (
  request: Request,
  url: URL,
  sessionData: SessionData,
  requestOrganization: string | undefined,
): Promise<Response | undefined> => {
  const outcome = await runGates({
    url: url.toString(),
    method: request.method,
    // toIdentity derives the request org's entitlements (groups, scopes,
    // attributes) from the membership map — gates decide per-org.
    identity: toIdentity(sessionData.user, requestOrganization),
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

  return undefined;
};

const noOrganizationResponse = (request: Request, pathname: string): Response => {
  console.info(`${label} No active organization on session`);
  // SRS-CY-31404: document requests funnel to the onboarding screen;
  // data and API requests get a machine-readable 401 instead of a 302
  // to an HTML page they cannot render.
  if (wantsJsonResponse(request, pathname)) {
    return new Response(JSON.stringify({ error: "no-organization" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return redirect("/onboarding");
};

/**
 * Refreshes the access token and re-derives the profile from it, persisting
 * both to the session. Returns undefined when there is no usable refresh token
 * or the refresh fails, so the caller can fall through to logout.
 */
const refreshSessionTokens = async (
  session: CytarioSession,
  sessionData: SessionData,
): Promise<SessionData | undefined> => {
  if (!isRefreshTokenValid(sessionData.authTokens.refreshToken)) {
    return undefined;
  }

  console.info(`${label} Fetch new tokens and credentials`);

  let newAuthTokens;
  try {
    newAuthTokens = await refreshAccessTokenWithLock(
      session.id,
      sessionData.authTokens.refreshToken,
    );
  } catch (error) {
    console.error(`${label} Token refresh failed:`, error);
  }

  if (!newAuthTokens) {
    return undefined;
  }

  // The fresh access token carries the current `organization` claim —
  // re-derive the membership map so an org added (or revoked) since
  // login shows up now, not at the next login. The session stores no
  // org; the request-org resolution handles a lost membership.
  const refreshedUser =
    profileFromTokenClaims(decodeJwtClaims(newAuthTokens.accessToken)) ?? sessionData.user;
  if (refreshedUser !== sessionData.user) {
    session.set("user", refreshedUser);
  }
  session.set("authTokens", newAuthTokens);

  return { ...sessionData, user: refreshedUser, authTokens: newAuthTokens };
};

/** The shared success tail: fetch the request org's credentials, persist them
 * into that org's bucket, wire authContext, and run the handler inside the
 * host request context. */
const proceedAuthenticated = async (
  { context, session, next }: AuthenticatedRequest,
  sessionData: SessionData,
  requestOrganization: string,
  persistCredentials: (credentials: SessionData["credentials"]) => Promise<void>,
): Promise<unknown> => {
  // The request org drives everything below: the derived entitlements
  // (groups, admin scopes, attributes of THIS org), the slice read/minted,
  // and the bucket the result is persisted into. Other tabs' orgs are never
  // touched; nothing org-flavored is persisted — the stored profile stays
  // membership-only and the entitlements live in the request context.
  const entitlements = orgEntitlements(sessionData.user, requestOrganization);

  const {
    sessionData: withCredentials,
    connectionConfigs,
    credentialErrors,
    connectionProviders,
  } = await fetchAllCredentials(sessionData, session.id, requestOrganization);

  // fetchAllCredentials already merged the refreshed slice into the per-org
  // map under the request org; persist that map, and expose the request org's
  // slice in the context — consumers read a flat connectionId → Credentials
  // record for THEIR org and never see another org's credentials.
  await persistCredentials(withCredentials.credentials);

  context.set(authContext, {
    ...sessionData,
    entitlements,
    credentials: withCredentials.credentials[requestOrganization] ?? {},
    connectionConfigs,
    credentialErrors,
    connectionProviders,
    sessionId: session.id,
    requestOrganization,
  });

  return withHostRequestContext(
    {
      user: sessionData.user,
      // The request org for plugin host capabilities (connections, catalogs).
      organization: requestOrganization,
      identity: toIdentity(sessionData.user, requestOrganization),
      authTokens: sessionData.authTokens,
      sessionId: session.id,
    },
    () => next(),
  );
};

export const authMiddleware: MiddlewareFunction = async (
  { request, url, context, params },
  next,
) => {
  console.info(`${label} ${request.method} ${request.url}`);

  const session = context.get(sessionContext);

  if (!session) {
    throw new Error("Session not found in context. Ensure sessionMiddleware runs first.");
  }

  const sessionData = await getSessionData(session);
  if (!isComplete(sessionData)) {
    return logout(url, session);
  }

  let updatedSessionData = sessionData as SessionData;

  // Request org BEFORE the gates: a gate's decision is org-scoped (it reads
  // the org's attributes — e.g. subscription state), so it must see the
  // identity projected to the org this request acts in. Resolution here is a
  // pure membership-map read — no tenant query runs before the gates.
  const requestOrganization =
    resolveRequestOrganization(url, updatedSessionData.user) ??
    (await defaultOrganization(updatedSessionData.user));

  const gateResponse = await applyGates(request, url, updatedSessionData, requestOrganization);
  if (gateResponse) {
    return gateResponse;
  }
  const urlOrg = organizationFromApiPath(url.pathname) ?? organizationFromPath(url.pathname);
  // A path under the /:org subtree whose first segment is NOT a membership
  // alias: either a foreign org, or a reserved word (a legacy un-prefixed
  // path like /recent that the catch-all matched as org="recent"). The
  // matched route's params carry that raw segment; both cases degrade to
  // "you are here" — the request never acts in an org its URL doesn't name.
  const pathOrg = urlOrg ?? params.org;
  if (pathOrg && pathOrg !== requestOrganization) {
    // Not a member (or the token no longer carries it) — degrade to "you are
    // here" instead of a 403, keeping org-agnostic sub-paths (a reserved
    // route like /recent) and dropping tenant-scoped ones (a connection id
    // would 404 in the other org).
    console.info(`${label} ${url.pathname} is not available in this session, redirecting`);
    const subPath = stripOrgPath(url.pathname);
    const keepTail = isOrgAgnosticPath(subPath);
    const target = requestOrganization;
    const to = target
      ? `${orgPath(target, keepTail ? subPath : "/")}${keepTail ? url.search : ""}`
      : "/onboarding";
    const message = `You don't have access to the organization "${pathOrg}" — showing "${target ?? "onboarding"}" instead.`;
    session.set("notification", { status: "warning", message });
    let setCookie: string | undefined;
    try {
      setCookie = (await sessionStorage.commitSession(session)).split(",")[0];
    } catch {
      // The redirect matters more than the banner.
    }
    return redirect(to, setCookie ? { headers: { "Set-Cookie": setCookie } } : undefined);
  }

  if (!requestOrganization) {
    return noOrganizationResponse(request, url.pathname);
  }

  // The pointer follows the org a document navigation actually used — it
  // seeds the login default and the org-agnostic fallback. Background data
  // fetches (.data, keep-alive revalidations) must not fight over it.
  const isDataFetch =
    url.pathname.endsWith(".data") ||
    request.headers.get("accept")?.includes("application/json") === true;
  if (!isDataFetch && urlOrg === requestOrganization) {
    void setPreferredOrg(updatedSessionData.user.sub, requestOrganization).catch(
      (error: unknown) => {
        console.warn(`${label} Storing the org preference failed:`, error);
      },
    );
  }

  const idTokenPayload = isTokenFresherThan(
    updatedSessionData.authTokens.accessToken,
    ACCESS_TOKEN_FRESHNESS_BUFFER_SECONDS,
  )
    ? await verifyIdToken(updatedSessionData.authTokens.idToken)
    : null;

  if (idTokenPayload) {
    return proceedAuthenticated(
      { context, session, next },
      updatedSessionData,
      requestOrganization!,
      async (credentials) => {
        if (credentials !== sessionData.credentials) {
          session.set("credentials", credentials);
          await sessionStorage.commitSession(session);
        }
      },
    );
  }

  const refreshedSessionData = await refreshSessionTokens(session, updatedSessionData);
  if (refreshedSessionData) {
    // The refresh re-derived the membership map from the fresh token. The
    // request org survives when the fresh token still carries it; when the
    // only remaining membership is elsewhere, the derived default takes the
    // request. With no membership left, fail closed to the zero-org funnel
    // rather than falling back to the org that was just removed — serving it
    // would read a revoked tenant with the fresh token's own claims.
    const stillMember =
      refreshedSessionData.user.organizations?.[requestOrganization] !== undefined;
    const refreshedRequestOrg = stillMember
      ? requestOrganization
      : await defaultOrganization(refreshedSessionData.user);
    if (!refreshedRequestOrg) {
      return noOrganizationResponse(request, url.pathname);
    }
    return proceedAuthenticated(
      { context, session, next },
      refreshedSessionData,
      refreshedRequestOrg,
      async (credentials) => {
        session.set("credentials", credentials);
        await sessionStorage.commitSession(session);
      },
    );
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
