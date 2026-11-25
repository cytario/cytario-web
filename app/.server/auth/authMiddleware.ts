import { createContext, redirect, type MiddlewareFunction } from "react-router";

import { activeOrgHintHeader, pickDefaultOrganization, readActiveOrgHint } from "./activeOrgHint";
import { getSessionData } from "./getSession";
import { getAllSessionCredentials } from "./getSessionCredentials";
import {
  decodeJwtClaims,
  orgEntitlements,
  profileFromTokenClaims,
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
import { resolveGateResource } from "~/.server/gateResourceFacts.server";
import { createLabel } from "~/.server/logging";
import { runGates } from "~/.server/pluginGates";
import { listConnections } from "~/routes/connections/connections.server";
import type { NotificationInput } from "~/utils/notifications";
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
  /** Connections a plugin gate reported visible-locked: listed and deletable,
   * never browsable. Empty when no gate locked anything. */
  lockedConnectionIds: string[];
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
 * path under the un-prefixed API carve-outs.
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
 * The default org for a request that names none: the cross-app hint, else
 * the persisted preference — both membership-validated. Derived at use —
 * the session carries no org-flavored state.
 */
const resolveDefaultOrganization = async (
  user: UserProfile,
  hinted: string | undefined,
): Promise<string | undefined> => {
  if (!user.organizations || Object.keys(user.organizations).length === 0) {
    return undefined;
  }
  if (hinted !== undefined && hinted in user.organizations) return hinted;
  const preferred = await getPreferredOrg(user.sub).catch((error: unknown) => {
    console.warn(`${label} Org preference lookup failed:`, error);
    return null;
  });
  return pickDefaultOrganization(user.organizations, hinted, preferred);
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
 * The JSON body a gate's refusal serializes: the message as `error`, plus the
 * CTA a UI can render beside it.
 */
const refusalBody = (
  outcome: { message?: string; resolveUrl?: string; resolveLabel?: string },
  fallback: string,
): string =>
  JSON.stringify({
    error: outcome.message ?? fallback,
    ...(outcome.resolveUrl ? { resolveUrl: outcome.resolveUrl } : {}),
    ...(outcome.resolveLabel ? { resolveLabel: outcome.resolveLabel } : {}),
  });

/**
 * Send a document request whose connection the gate locked back to the org's
 * connection listing, with the gate's own copy as a flash notification.
 */
const lockedConnectionRedirect = async (
  session: CytarioSession,
  organization: string | undefined,
  message: string,
): Promise<Response> => {
  session.set("notification", { status: "warning", message } satisfies NotificationInput);
  let setCookie: string | undefined;
  try {
    setCookie = (await sessionStorage.commitSession(session)).split(",")[0];
  } catch {
    // The redirect matters more than the banner.
  }
  return redirect(
    orgPath(organization, "/"),
    setCookie ? { headers: { "Set-Cookie": setCookie } } : undefined,
  );
};

/**
 * Runs the plugin gates for the request, ahead of credential minting and before
 * the ConnectionConfig listing, so a zero-org or gated session cannot fall
 * through to an unscoped tenant read; gates receive only the PII-free identity
 * projection plus the resource facts this request names. Returns the gate's
 * redirect/deny/lock response, or the connections it locked without naming one.
 */
const applyGates = async (
  request: Request,
  url: URL,
  sessionData: SessionData,
  session: CytarioSession,
  requestOrganization: string | undefined,
): Promise<{ response?: Response; lockedConnectionIds: string[] }> => {
  // Resolved only when a gate exists to read them, and best-effort: an unknown
  // fact is absent, never guessed.
  const resource = requestOrganization
    ? await resolveGateResource({
        request,
        url,
        user: sessionData.user,
        organization: requestOrganization,
        sessionId: session.id,
        authTokens: sessionData.authTokens,
      })
    : undefined;

  const outcome = await runGates({
    url: url.toString(),
    method: request.method,
    // toIdentity derives the request org's entitlements (groups, scopes,
    // attributes) from the membership map — gates decide per-org.
    identity: toIdentity(sessionData.user, requestOrganization),
    ...(resource ? { resource } : {}),
  });

  if (outcome.kind === "redirect") {
    console.info(`${label} Gate redirect to ${outcome.url}`);
    return { response: redirect(outcome.url), lockedConnectionIds: [] };
  }

  if (outcome.kind === "deny") {
    const status = outcome.status ?? 403;
    console.info(`${label} Gate denied request with status ${status}`);
    return {
      response: new Response(refusalBody(outcome, "Request denied"), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
      lockedConnectionIds: [],
    };
  }

  if (outcome.kind === "lock") {
    // A lock naming the connection THIS request addresses leaves nothing to
    // render: a document navigation goes back to the listing carrying the
    // gate's notice, a data/API request gets a 402 rather than a 302 to an HTML
    // page it cannot render.
    const requestedConnectionId = resource?.connectionId;
    if (requestedConnectionId && outcome.connectionIds.includes(requestedConnectionId)) {
      console.info(`${label} Gate locked the requested connection ${requestedConnectionId}`);
      if (wantsJsonResponse(request, url.pathname)) {
        return {
          response: new Response(refusalBody(outcome, "Request locked"), {
            status: 402,
            headers: { "Content-Type": "application/json" },
          }),
          lockedConnectionIds: [],
        };
      }
      return {
        response: await lockedConnectionRedirect(
          session,
          requestOrganization,
          outcome.message ?? "This connection needs a paid plan to browse.",
        ),
        lockedConnectionIds: [],
      };
    }
    // Nothing this request names: it proceeds, and the ids render locked
    // wherever the host lists them.
    return { lockedConnectionIds: outcome.connectionIds };
  }

  return { lockedConnectionIds: [] };
};

const noOrganizationResponse = (request: Request, pathname: string): Response => {
  console.info(`${label} No active organization on session`);
  // Document requests funnel to the onboarding screen;
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
  lockedConnectionIds: string[],
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
    lockedConnectionIds,
    sessionId: session.id,
    requestOrganization,
  });

  return withHostRequestContext(
    {
      user: sessionData.user,
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
  const incomingHint = await readActiveOrgHint(request.headers.get("cookie"));

  // Request org BEFORE the gates: a gate's decision is org-scoped (it reads
  // the org's attributes — e.g. subscription state), so it must see the
  // identity projected to the org this request acts in. Resolution here is a
  // pure membership-map read — no tenant query runs before the gates, apart
  // from the single org-scoped connection the gate's resource facts need.
  const requestOrganization =
    resolveRequestOrganization(url, updatedSessionData.user) ??
    (await resolveDefaultOrganization(updatedSessionData.user, incomingHint));

  const gateResult = await applyGates(
    request,
    url,
    updatedSessionData,
    session,
    requestOrganization,
  );
  if (gateResult.response) {
    return gateResult.response;
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

  // The last-used-org preference follows the org a document navigation
  // actually used — it seeds the login default and the org-agnostic fallback.
  // Background data fetches (.data, keep-alive revalidations) must not write
  // it: one tab's fetch would silently move another tab's next org-less
  // navigation. The cross-app hint publishes on the same condition.
  const isDataFetch =
    url.pathname.endsWith(".data") ||
    request.headers.get("accept")?.includes("application/json") === true;
  const publishHint = !isDataFetch && urlOrg === requestOrganization;
  if (publishHint) {
    void setPreferredOrg(updatedSessionData.user.sub, requestOrganization).catch(
      (error: unknown) => {
        console.warn(`${label} Storing the org preference failed:`, error);
      },
    );
  }

  // Only when the hint would change — an unchanged value needs no Set-Cookie.
  // Best-effort: a serialization failure never blocks the navigation.
  const hintHeader =
    publishHint && incomingHint !== requestOrganization
      ? await activeOrgHintHeader(requestOrganization).catch(() => undefined)
      : undefined;

  const idTokenPayload = isTokenFresherThan(
    updatedSessionData.authTokens.accessToken,
    ACCESS_TOKEN_FRESHNESS_BUFFER_SECONDS,
  )
    ? await verifyIdToken(updatedSessionData.authTokens.idToken)
    : null;

  const withHint = (response: unknown): unknown => {
    if (hintHeader && response instanceof Response) {
      response.headers.append("Set-Cookie", hintHeader);
    }
    return response;
  };

  if (idTokenPayload) {
    return withHint(
      await proceedAuthenticated(
        { context, session, next },
        updatedSessionData,
        requestOrganization!,
        gateResult.lockedConnectionIds,
        async (credentials) => {
          if (credentials !== sessionData.credentials) {
            session.set("credentials", credentials);
            await sessionStorage.commitSession(session);
          }
        },
      ),
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
      : await resolveDefaultOrganization(refreshedSessionData.user, incomingHint);
    if (!refreshedRequestOrg) {
      return noOrganizationResponse(request, url.pathname);
    }
    return proceedAuthenticated(
      { context, session, next },
      refreshedSessionData,
      refreshedRequestOrg,
      // The gate ran in the pre-refresh org; a verdict about another org's
      // connections must never reach this request's listings.
      refreshedRequestOrg === requestOrganization ? gateResult.lockedConnectionIds : [],
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
