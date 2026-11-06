import { redirect } from "react-router";

import { authMiddleware, authContext } from "../authMiddleware";
import { getSessionData } from "../getSession";
import { getAllSessionCredentials } from "../getSessionCredentials";
import { getPreferredOrg, setPreferredOrg } from "../orgPreference.server";
import { refreshAccessTokenWithLock } from "../refreshAuthTokens";
import { sessionContext } from "../sessionMiddleware";
import { sessionStorage, type SessionData } from "../sessionStorage";
import { verifyIdToken } from "../verifyIdToken";
import { runGates } from "~/.server/pluginGates";
import { listConnections } from "~/routes/connections/connections.server";
import mock from "~/utils/__tests__/__mocks__";

vi.mock("../getSession", () => ({
  getSessionData: vi.fn(),
}));

vi.mock("../getSessionCredentials", () => ({
  getAllSessionCredentials: vi.fn(),
}));

vi.mock("../orgPreference.server", () => ({
  getPreferredOrg: vi.fn(),
  setPreferredOrg: vi.fn(),
}));

vi.mock("../refreshAuthTokens", () => ({
  refreshAccessTokenWithLock: vi.fn(),
}));

vi.mock("../sessionStorage", () => ({
  sessionStorage: {
    commitSession: vi.fn(),
    destroySession: vi.fn(),
  },
}));

vi.mock("~/routes/connections/connections.server", () => ({
  listConnections: vi.fn(),
}));

vi.mock("../verifyIdToken", () => ({
  verifyIdToken: vi.fn(),
}));

vi.mock("~/.server/pluginGates", () => ({
  runGates: vi.fn(),
}));

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    // Real `redirect()` returns a Response. authMiddleware now RETURNS
    // that Response so RR's middleware pipeline can hand it to the
    // single-fetch redirect encoder (`handleSingleFetchRequest` ↔
    // `generateSingleFetchRedirectResponse`); throwing it would land in
    // `singleFetchLoaders.generateMiddlewareResponse`'s catch and turn
    // into an opaque HTTP 500 that surfaces client-side as
    // `SingleFetchNoResultError`. Mock mirrors real semantics.
    redirect: vi.fn((url, init) => {
      const response = new Response(null, { status: 302, ...init });
      (response as Response & { url: string }).url = url;
      return response;
    }),
  };
});

describe("authMiddleware", () => {
  const mockNext = vi.fn();
  const mockSession = mock.session();
  const mockConnectionConfigs = [mock.connectionConfig()];

  // Valid JWT payload (from verifyIdToken)
  const validIdTokenPayload = {
    sub: "user-123",
    exp: Math.floor(Date.now() / 1000) + 3600,
    iss: "https://auth.example.com/realms/test",
  };

  /** An unsigned JWT with an arbitrary JSON payload (decode-only paths read it). */
  const forgeToken = (payload: Record<string, unknown>): string => {
    const b64url = (obj: unknown) =>
      Buffer.from(JSON.stringify(obj))
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    return `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(payload)}.`;
  };

  // Valid and expired refresh tokens (lightweight base64 check only)
  const validRefreshToken = mock.idToken({
    exp: Math.floor(Date.now() / 1000) + 86400,
  });
  const expiredRefreshToken = mock.idToken({
    exp: Math.floor(Date.now() / 1000) - 3600,
  });

  const mockSessionData = {
    user: mock.user(),
    authTokens: {
      accessToken: mock.idToken(),
      idToken: "valid-id-token",
      refreshToken: validRefreshToken,
    },
    credentials: { org1: {} },
    notification: undefined,
  } satisfies SessionData;

  /** A URL naming an org (the `/:org` route prefix). */
  const orgUrl = (org: string, path = "/") =>
    new URL(`http://localhost/${org}${path === "/" ? "" : path}`);

  const createMiddlewareArgs = (
    params: Record<string, string> = {},
    hasSession = true,
    // Default URL names the session's own org — a bare path like /test would
    // read as a foreign `/:org` segment and hit the foreign-org redirect.
    request: Request = new Request("http://localhost/org1"),
    url: URL = new URL(request.url),
  ) => {
    const context = new Map();
    if (hasSession) {
      context.set(sessionContext, mockSession);
    }

    return {
      request,
      url,
      params,
      context: {
        get: (key: unknown) => context.get(key),
        set: vi.fn((key: unknown, value: unknown) => context.set(key, value)),
      },
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockNext.mockResolvedValue(new Response("OK"));
    vi.mocked(getSessionData).mockResolvedValue(mockSessionData);
    vi.mocked(verifyIdToken).mockResolvedValue(validIdTokenPayload);
    vi.mocked(sessionStorage.commitSession).mockResolvedValue("session-cookie");
    vi.mocked(sessionStorage.destroySession).mockResolvedValue("destroy-cookie");
    vi.mocked(listConnections).mockResolvedValue(mockConnectionConfigs);
    // By default the request org's slice is returned unchanged (no mint =
    // no change = no session commit). The mock honors the slice contract:
    // result.credentials is the ORG SLICE of the passed session data.
    vi.mocked(getAllSessionCredentials).mockImplementation(
      async (sessionData, _connectionConfigs, _sessionId, organization) => ({
        credentials: sessionData.credentials[organization] ?? {},
        errors: {},
        providers: {},
      }),
    );
    vi.mocked(refreshAccessTokenWithLock).mockResolvedValue({
      accessToken: "new-access-token",
      idToken: "new-id-token",
      refreshToken: validRefreshToken,
    });
    // No plugin loaded by default → gates short-circuit to continue.
    vi.mocked(runGates).mockResolvedValue({ kind: "continue" });
    vi.mocked(getPreferredOrg).mockResolvedValue(null);
    vi.mocked(setPreferredOrg).mockResolvedValue(undefined);
  });

  describe("Session Context", () => {
    test("throws if sessionMiddleware hasn't run", async () => {
      const args = createMiddlewareArgs({}, false);

      await expect(
        authMiddleware(args as unknown as Parameters<typeof authMiddleware>[0], mockNext),
      ).rejects.toThrow("Session not found in context. Ensure sessionMiddleware runs first.");
    });
  });

  describe("Valid Token Flow", () => {
    test("proceeds to next() when idToken is verified", async () => {
      const args = createMiddlewareArgs();

      await authMiddleware(args as unknown as Parameters<typeof authMiddleware>[0], mockNext);

      expect(verifyIdToken).toHaveBeenCalledWith("valid-id-token");
      expect(mockNext).toHaveBeenCalled();
    });

    test("sets authContext with session data and bucket configs", async () => {
      const args = createMiddlewareArgs();

      await authMiddleware(args as unknown as Parameters<typeof authMiddleware>[0], mockNext);

      expect(args.context.set).toHaveBeenCalledWith(
        authContext,
        expect.objectContaining({
          user: expect.any(Object),
          authTokens: expect.any(Object),
          connectionConfigs: mockConnectionConfigs,
        }),
      );
    });

    test("does not refresh tokens when idToken is verified", async () => {
      const args = createMiddlewareArgs();

      await authMiddleware(args as unknown as Parameters<typeof authMiddleware>[0], mockNext);

      expect(refreshAccessTokenWithLock).not.toHaveBeenCalled();
    });
  });

  describe("Credential Fetching", () => {
    test("fetches all bucket configs and credentials", async () => {
      const args = createMiddlewareArgs();

      await authMiddleware(args as unknown as Parameters<typeof authMiddleware>[0], mockNext);

      expect(listConnections).toHaveBeenCalledWith(mockSessionData.user, "org1");
      expect(getAllSessionCredentials).toHaveBeenCalledWith(
        expect.objectContaining({ user: expect.any(Object) }),
        mockConnectionConfigs,
        mockSession.id,
        "org1",
      );
    });

    test("fetches credentials regardless of route params", async () => {
      // Even without bucketName in params, credentials are fetched for all buckets
      const args = createMiddlewareArgs();

      await authMiddleware(args as unknown as Parameters<typeof authMiddleware>[0], mockNext);

      expect(getAllSessionCredentials).toHaveBeenCalled();
    });

    test("does not commit session when credentials unchanged", async () => {
      const args = createMiddlewareArgs();

      await authMiddleware(args as unknown as Parameters<typeof authMiddleware>[0], mockNext);

      expect(sessionStorage.commitSession).not.toHaveBeenCalled();
    });

    test("commits session when credentials changed", async () => {
      const newCredentials = { "new-bucket": mock.credentials() };
      vi.mocked(getAllSessionCredentials).mockResolvedValue({
        credentials: newCredentials,
        errors: {},
        providers: {},
      });

      const args = createMiddlewareArgs();

      await authMiddleware(args as unknown as Parameters<typeof authMiddleware>[0], mockNext);

      expect(mockSession.set).toHaveBeenCalledWith("credentials", {
        org1: newCredentials,
      });
      expect(sessionStorage.commitSession).toHaveBeenCalledWith(mockSession);
    });

    test("propagates error when credential fetch fails", async () => {
      vi.mocked(getAllSessionCredentials).mockRejectedValue(new Error("STS service unavailable"));

      const args = createMiddlewareArgs();

      await expect(
        authMiddleware(args as unknown as Parameters<typeof authMiddleware>[0], mockNext),
      ).rejects.toThrow("STS service unavailable");
    });
  });

  describe("Default organization (derived when the URL names none)", () => {
    // Org-neutral stored profile, like the real session shape (enrichUserProfile
    // clears the projection): the default-org derivation reads the membership
    // map only.
    const multiOrgUser = () =>
      mock.user({
        organizations: {
          alpha: { groups: ["lab"], attributes: {} },
          zeta: { groups: ["research"], attributes: {} },
        },
      });

    test("the persisted preference wins when the token still carries it", async () => {
      vi.mocked(getSessionData).mockResolvedValue({
        ...mockSessionData,
        user: multiOrgUser(),
      });
      vi.mocked(getPreferredOrg).mockResolvedValue("zeta");

      // No org in the URL (a reserved-root path): the preference drives.
      const request = new Request("http://localhost/recent");
      const args = createMiddlewareArgs({}, true, request, new URL(request.url));
      await authMiddleware(args as unknown as Parameters<typeof authMiddleware>[0], mockNext);

      expect(getPreferredOrg).toHaveBeenCalledWith("mock-user-id");
      expect(args.context.set).toHaveBeenCalledWith(
        authContext,
        expect.objectContaining({ requestOrganization: "zeta" }),
      );
      // Nothing org-flavored is persisted on the session.
      expect(mockSession.set).not.toHaveBeenCalledWith("activeOrganization", expect.anything());
    });

    test("falls back to the first alias when there is no preference", async () => {
      vi.mocked(getSessionData).mockResolvedValue({
        ...mockSessionData,
        user: multiOrgUser(),
      });
      vi.mocked(getPreferredOrg).mockResolvedValue(null);

      // No org in the URL (a reserved-root path): the derived default drives.
      const request = new Request("http://localhost/recent");
      const args = createMiddlewareArgs({}, true, request, new URL(request.url));
      await authMiddleware(args as unknown as Parameters<typeof authMiddleware>[0], mockNext);

      expect(args.context.set).toHaveBeenCalledWith(
        authContext,
        expect.objectContaining({ requestOrganization: "alpha" }),
      );
    });

    test("falls back to the first alias when the preference is no longer a membership", async () => {
      vi.mocked(getSessionData).mockResolvedValue({
        ...mockSessionData,
        user: multiOrgUser(),
      });
      vi.mocked(getPreferredOrg).mockResolvedValue("revoked");

      // No org in the URL (a reserved-root path): the derived default drives.
      const request = new Request("http://localhost/recent");
      const args = createMiddlewareArgs({}, true, request, new URL(request.url));
      await authMiddleware(args as unknown as Parameters<typeof authMiddleware>[0], mockNext);

      expect(args.context.set).toHaveBeenCalledWith(
        authContext,
        expect.objectContaining({ requestOrganization: "alpha" }),
      );
    });
  });

  describe("Request organization (URL drives org)", () => {
    // The STORED profile is org-neutral: memberships only, no projected
    // groups — the request-org projection is derived per request from the
    // membership map, never read from the session user.
    const multiOrgUser = () =>
      mock.user({
        organizations: {
          alpha: { groups: ["lab"], attributes: {} },
          zeta: { groups: ["research"], attributes: {} },
        },
      });

    test("a URL naming another membership is the request org — no session re-scope", async () => {
      // The preference seeds alpha as the default; the URL names zeta. The
      // request acts in zeta (identity derived, credentials sliced) WITHOUT
      // recording zeta as the last-used org for a background fetch.
      vi.mocked(getSessionData).mockResolvedValue({
        ...mockSessionData,
        user: multiOrgUser(),
        credentials: { alpha: { "alpha-conn": mock.credentials() }, zeta: {} },
      });

      // A keep-alive-style background revalidation (.data): acts in the
      // URL's org but must not write the last-used-org preference.
      const dataUrl = new URL(
        `http://localhost/zeta/connections?_routes=layouts%2Fprotected.layout`,
      );
      const request = new Request(dataUrl, { headers: { accept: "application/json" } });
      const args = createMiddlewareArgs({}, true, request, dataUrl);
      await authMiddleware(args as unknown as Parameters<typeof authMiddleware>[0], mockNext);

      // The context carries zeta's projected profile and request org.
      expect(args.context.set).toHaveBeenCalledWith(
        authContext,
        expect.objectContaining({
          requestOrganization: "zeta",
          credentials: {},
        }),
      );
      expect(mockNext).toHaveBeenCalled();
      // The preference was NOT recorded for this background fetch.
      expect(setPreferredOrg).not.toHaveBeenCalledWith("mock-user-id", "zeta");
    });

    test("a document navigation to another membership records the last-used-org preference", async () => {
      vi.mocked(getSessionData).mockResolvedValue({
        ...mockSessionData,
        user: multiOrgUser(),
        credentials: { alpha: {}, zeta: {} },
      });

      const url = orgUrl("zeta");
      const request = new Request(url, { headers: { accept: "text/html" } });
      const args = createMiddlewareArgs({}, true, request, url);
      await authMiddleware(args as unknown as Parameters<typeof authMiddleware>[0], mockNext);

      expect(setPreferredOrg).toHaveBeenCalledWith("mock-user-id", "zeta");
    });

    test("a foreign URL org redirects back to the session's org before credential work", async () => {
      vi.mocked(getSessionData).mockResolvedValue({
        ...mockSessionData,
        user: multiOrgUser(),
      });

      const url = orgUrl("foreign", "/some/conn");
      const request = new Request(url);
      const args = createMiddlewareArgs({}, true, request, url);
      const result = (await authMiddleware(
        args as unknown as Parameters<typeof authMiddleware>[0],
        mockNext,
      )) as Response;

      // Redirected before any tenant read; the banner names both orgs.
      expect(result.status).toBe(302);
      expect((result as Response & { url: string }).url).toBe("/alpha");
      expect(mockNext).not.toHaveBeenCalled();
      expect(listConnections).not.toHaveBeenCalled();
      expect(mockSession.set).toHaveBeenCalledWith(
        "notification",
        expect.objectContaining({ status: "warning" }),
      );
    });

    test("a revoked membership in the URL degrades to the session's org with the org-agnostic tail kept", async () => {
      vi.mocked(getSessionData).mockResolvedValue({
        ...mockSessionData,
        user: multiOrgUser(),
      });

      // "omega" is NOT in the membership map (revoked mid-session), the tail
      // is a reserved route, so the redirect keeps it under the session's org.
      const url = orgUrl("omega", "/recent");
      const request = new Request(url);
      const args = createMiddlewareArgs({}, true, request, url);
      const result = (await authMiddleware(
        args as unknown as Parameters<typeof authMiddleware>[0],
        mockNext,
      )) as Response;

      expect(result.status).toBe(302);
      expect((result as Response & { url: string }).url).toBe("/alpha/recent");
    });

    test("an un-prefixed legacy path (reserved first segment) redirects to the default org, never serves in it", async () => {
      vi.mocked(getSessionData).mockResolvedValue({
        ...mockSessionData,
        user: multiOrgUser(),
      });

      // /recent matches the /:org subtree with org="recent" — a reserved
      // word, not a membership. The request must not act in the default org
      // at this URL; it redirects with the org-agnostic tail kept.
      const request = new Request("http://localhost/recent");
      const args = createMiddlewareArgs({ org: "recent" }, true, request, new URL(request.url));
      const result = (await authMiddleware(
        args as unknown as Parameters<typeof authMiddleware>[0],
        mockNext,
      )) as Response;

      expect(result.status).toBe(302);
      expect((result as Response & { url: string }).url).toBe("/alpha/recent");
      expect(mockNext).not.toHaveBeenCalled();
      expect(listConnections).not.toHaveBeenCalled();
    });

    test("the bare root passes through to the redirect route (params carry no org)", async () => {
      vi.mocked(getSessionData).mockResolvedValue({
        ...mockSessionData,
        user: multiOrgUser(),
      });

      // "/" matches rootRedirect, not the /:org subtree: no params.org, no
      // redirect here — the route's own loader lands the user in the default.
      const request = new Request("http://localhost/");
      const args = createMiddlewareArgs({}, true, request, new URL(request.url));

      await authMiddleware(args as unknown as Parameters<typeof authMiddleware>[0], mockNext);

      expect(redirect).not.toHaveBeenCalledWith(
        expect.stringContaining("/alpha"),
        expect.anything(),
      );
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe("Token Refresh Flow", () => {
    test("refreshes tokens when idToken verification fails but refreshToken valid", async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(null);

      const args = createMiddlewareArgs();

      await authMiddleware(args as unknown as Parameters<typeof authMiddleware>[0], mockNext);

      expect(refreshAccessTokenWithLock).toHaveBeenCalledWith(mockSession.id, validRefreshToken);
    });

    test("refreshes tokens when the access token is expiring even though the id token still verifies", async () => {
      // The access token has < the freshness buffer left (but is not yet dead),
      // while the id token still verifies. This is the exact window that produced
      // the intermittent portal 401: the stale access token must NOT be forwarded.
      const expiringAccessToken = mock.idToken({
        exp: Math.floor(Date.now() / 1000) + 30,
      });
      vi.mocked(getSessionData).mockResolvedValue({
        ...mockSessionData,
        authTokens: {
          ...mockSessionData.authTokens,
          accessToken: expiringAccessToken,
        },
      });

      const args = createMiddlewareArgs();

      await authMiddleware(args as unknown as Parameters<typeof authMiddleware>[0], mockNext);

      expect(refreshAccessTokenWithLock).toHaveBeenCalledWith(mockSession.id, validRefreshToken);
      expect(verifyIdToken).not.toHaveBeenCalled();
    });

    test("re-derives the membership map from the fresh access token on refresh", async () => {
      // A second org was granted since login; the fresh access token carries
      // it, and the refresh path must surface it without a re-login.
      const expiringAccessToken = mock.idToken({
        exp: Math.floor(Date.now() / 1000) + 30,
      });
      vi.mocked(getSessionData).mockResolvedValue({
        ...mockSessionData,
        user: mock.user({ organizations: { org1: { groups: ["org1/lab"], attributes: {} } } }),
        authTokens: {
          ...mockSessionData.authTokens,
          accessToken: expiringAccessToken,
        },
      });
      const refreshedAccessToken = forgeToken({
        sub: "user-123",
        email_verified: true,
        name: "string",
        preferred_username: "string",
        given_name: "string",
        family_name: "string",
        email: "string",
        organization: { org1: { groups: ["org1/lab"] }, org2: { groups: ["org2/x"] } },
      });
      vi.mocked(refreshAccessTokenWithLock).mockResolvedValue({
        accessToken: refreshedAccessToken,
        idToken: "refreshed-id-token",
        refreshToken: validRefreshToken,
      });

      const args = createMiddlewareArgs();

      await authMiddleware(args as unknown as Parameters<typeof authMiddleware>[0], mockNext);

      // The session now carries both memberships.
      expect(mockSession.set).toHaveBeenCalledWith(
        "user",
        expect.objectContaining({
          organizations: expect.objectContaining({
            org1: expect.anything(),
            org2: expect.anything(),
          }),
        }),
      );
    });

    test("fails closed to the zero-org funnel when the fresh token carries no membership", async () => {
      // The last membership was revoked mid-session: the fresh token's
      // organization claim is empty. The request must not fall back to the
      // removed org (the pre-fix `?? requestOrganization` did exactly that).
      const expiringAccessToken = mock.idToken({
        exp: Math.floor(Date.now() / 1000) + 30,
      });
      vi.mocked(getSessionData).mockResolvedValue({
        ...mockSessionData,
        user: mock.user({ organizations: { org1: { groups: ["org1/lab"], attributes: {} } } }),
        authTokens: {
          ...mockSessionData.authTokens,
          accessToken: expiringAccessToken,
        },
      });
      const emptiedAccessToken = forgeToken({
        sub: "user-123",
        email_verified: true,
        name: "string",
        preferred_username: "string",
        given_name: "string",
        family_name: "string",
        email: "string",
        organization: {},
      });
      vi.mocked(refreshAccessTokenWithLock).mockResolvedValue({
        accessToken: emptiedAccessToken,
        idToken: "refreshed-id-token",
        refreshToken: validRefreshToken,
      });

      const args = createMiddlewareArgs();

      const result = (await authMiddleware(
        args as unknown as Parameters<typeof authMiddleware>[0],
        mockNext,
      )) as Response;

      expect(result).toBeInstanceOf(Response);
      // Document requests redirect to /onboarding (the zero-org funnel),
      // never the removed org's subtree.
      expect(redirect).toHaveBeenCalledWith("/onboarding");
      expect(listConnections).not.toHaveBeenCalled();
      expect(mockNext).not.toHaveBeenCalled();
    });

    test("does not refresh when the access token is fresh", async () => {
      const args = createMiddlewareArgs();

      await authMiddleware(args as unknown as Parameters<typeof authMiddleware>[0], mockNext);

      expect(verifyIdToken).toHaveBeenCalledWith("valid-id-token");
      expect(refreshAccessTokenWithLock).not.toHaveBeenCalled();
    });

    test("updates session with new tokens after refresh", async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(null);

      const args = createMiddlewareArgs();

      await authMiddleware(args as unknown as Parameters<typeof authMiddleware>[0], mockNext);

      expect(mockSession.set).toHaveBeenCalledWith(
        "authTokens",
        expect.objectContaining({
          accessToken: "new-access-token",
        }),
      );
    });

    test("commits session after token refresh", async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(null);

      const args = createMiddlewareArgs();

      await authMiddleware(args as unknown as Parameters<typeof authMiddleware>[0], mockNext);

      expect(sessionStorage.commitSession).toHaveBeenCalledWith(mockSession);
    });

    test("proceeds to next() after successful token refresh", async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(null);

      const args = createMiddlewareArgs();

      await authMiddleware(args as unknown as Parameters<typeof authMiddleware>[0], mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    test("fetches credentials with refreshed tokens", async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(null);

      const args = createMiddlewareArgs();

      await authMiddleware(args as unknown as Parameters<typeof authMiddleware>[0], mockNext);

      expect(getAllSessionCredentials).toHaveBeenCalledWith(
        expect.objectContaining({
          authTokens: expect.objectContaining({
            accessToken: "new-access-token",
          }),
        }),
        mockConnectionConfigs,
        mockSession.id,
        "org1",
      );
    });

    test("propagates error when credential fetch fails after refresh", async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(null);
      vi.mocked(getAllSessionCredentials).mockRejectedValue(new Error("STS service unavailable"));

      const args = createMiddlewareArgs();

      await expect(
        authMiddleware(args as unknown as Parameters<typeof authMiddleware>[0], mockNext),
      ).rejects.toThrow("STS service unavailable");
    });

    test("redirects to login when refresh lock exhaustion throws", async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(null);
      vi.mocked(refreshAccessTokenWithLock).mockRejectedValue(
        new Error("Failed to acquire refresh lock after maximum retries"),
      );
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const args = createMiddlewareArgs();

      const result = await authMiddleware(
        args as unknown as Parameters<typeof authMiddleware>[0],
        mockNext,
      );

      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(302);
      expect(mockNext).not.toHaveBeenCalled();
      expect(sessionStorage.destroySession).toHaveBeenCalledWith(mockSession);
      expect(redirect).toHaveBeenCalledWith(
        expect.stringContaining("/login?redirect="),
        expect.objectContaining({
          headers: expect.objectContaining({
            "Set-Cookie": "destroy-cookie",
          }),
        }),
      );
      consoleSpy.mockRestore();
    });

    test("redirects to login when token refresh fails with Keycloak error", async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(null);
      vi.mocked(refreshAccessTokenWithLock).mockRejectedValue(
        new Error("invalid_grant: Token is not active"),
      );
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const args = createMiddlewareArgs();

      const result = await authMiddleware(
        args as unknown as Parameters<typeof authMiddleware>[0],
        mockNext,
      );

      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(302);
      expect(mockNext).not.toHaveBeenCalled();
      expect(sessionStorage.destroySession).toHaveBeenCalledWith(mockSession);
      expect(redirect).toHaveBeenCalledWith(
        expect.stringContaining("/login?redirect="),
        expect.objectContaining({
          headers: expect.objectContaining({
            "Set-Cookie": "destroy-cookie",
          }),
        }),
      );
      consoleSpy.mockRestore();
    });
  });

  describe("Onboarding Redirect", () => {
    // A zero-org session has no memberships, so any `/:org` URL would read as
    // a foreign org — these tests use reserved-root paths (no org segment).
    const zeroOrgArgs = () => {
      const request = new Request("http://localhost/recent");
      return createMiddlewareArgs({}, true, request, new URL(request.url));
    };

    test("redirects zero-org sessions to /onboarding before fetching credentials", async () => {
      vi.mocked(getSessionData).mockResolvedValue({
        ...mockSessionData,
        user: mock.user({ organizations: {} }),
      });

      const args = zeroOrgArgs();

      const result = await authMiddleware(
        args as unknown as Parameters<typeof authMiddleware>[0],
        mockNext,
      );

      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(302);
      expect(redirect).toHaveBeenCalledWith("/onboarding");
      expect(listConnections).not.toHaveBeenCalled();
      expect(getAllSessionCredentials).not.toHaveBeenCalled();
      expect(mockNext).not.toHaveBeenCalled();
    });

    test("answers a JSON-accepting zero-org request with a 401, not a redirect", async () => {
      vi.mocked(getSessionData).mockResolvedValue({
        ...mockSessionData,
        user: mock.user({ organizations: {} }),
      });

      const args = zeroOrgArgs();
      args.request.headers.set("accept", "application/json");

      const result = await authMiddleware(
        args as unknown as Parameters<typeof authMiddleware>[0],
        mockNext,
      );

      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(401);
      await expect((result as Response).json()).resolves.toEqual({
        error: "no-organization",
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test("answers a zero-org API-path request with a 401 regardless of Accept", async () => {
      vi.mocked(getSessionData).mockResolvedValue({
        ...mockSessionData,
        user: mock.user({ organizations: {} }),
      });

      const args = createMiddlewareArgs(
        {},
        true,
        new Request("http://localhost/api/connections", {
          headers: { accept: "text/html" },
        }),
      );

      const result = await authMiddleware(
        args as unknown as Parameters<typeof authMiddleware>[0],
        mockNext,
      );

      expect((result as Response).status).toBe(401);
    });
  });

  describe("Plugin Gates", () => {
    test("gate redirect wins and short-circuits before credential fetch", async () => {
      vi.mocked(runGates).mockResolvedValue({
        kind: "redirect",
        url: "https://admin.cytario.com/onboard?return_to=app",
      });

      const args = createMiddlewareArgs();

      const result = await authMiddleware(
        args as unknown as Parameters<typeof authMiddleware>[0],
        mockNext,
      );

      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(302);
      expect(redirect).toHaveBeenCalledWith("https://admin.cytario.com/onboard?return_to=app");
      expect(listConnections).not.toHaveBeenCalled();
      expect(mockNext).not.toHaveBeenCalled();
    });

    test("passes url, method, and the request-org identity projection to the gate", async () => {
      const args = createMiddlewareArgs(
        {},
        true,
        new Request("http://localhost/org1/protected", { method: "POST" }),
      );

      await authMiddleware(args as unknown as Parameters<typeof authMiddleware>[0], mockNext);

      expect(runGates).toHaveBeenCalledWith({
        url: "http://localhost/org1/protected",
        method: "POST",
        // Gates see the request org — their decisions read org attributes.
        identity: expect.objectContaining({ organization: "org1", sub: "mock-user-id" }),
      });
      const [{ identity }] = vi.mocked(runGates).mock.calls[0];
      expect(identity).not.toHaveProperty("email");
      expect(identity).not.toHaveProperty("name");
    });

    test("passes RR-normalized url to the gate, stripping single-fetch _routes param from keep-alive revalidation URLs", async () => {
      const request = new Request(
        "http://localhost/plugin/jobs.data?_routes=routes%2Fplugin%2Fplugin.%24",
      );
      const url = new URL("http://localhost/plugin/jobs");
      const args = createMiddlewareArgs({}, true, request, url);

      await authMiddleware(args as unknown as Parameters<typeof authMiddleware>[0], mockNext);

      expect(runGates).toHaveBeenCalledWith(
        expect.objectContaining({ url: "http://localhost/plugin/jobs" }),
      );
    });

    test("deny on POST returns a 403 JSON Response with the gate message", async () => {
      vi.mocked(runGates).mockResolvedValue({
        kind: "deny",
        status: 403,
        message: "read-only during offboarding",
      });

      const args = createMiddlewareArgs(
        {},
        true,
        new Request("http://localhost/upload", { method: "POST" }),
      );

      const result = await authMiddleware(
        args as unknown as Parameters<typeof authMiddleware>[0],
        mockNext,
      );

      expect(result).toBeInstanceOf(Response);
      const response = result as Response;
      expect(response.status).toBe(403);
      expect(response.headers.get("Content-Type")).toBe("application/json");
      expect(await response.json()).toEqual({ error: "read-only during offboarding" });
      expect(listConnections).not.toHaveBeenCalled();
      expect(mockNext).not.toHaveBeenCalled();
    });

    test("deny defaults to status 403 when none provided", async () => {
      vi.mocked(runGates).mockResolvedValue({ kind: "deny", message: "blocked" });

      const args = createMiddlewareArgs(
        {},
        true,
        new Request("http://localhost/upload", { method: "DELETE" }),
      );

      const result = await authMiddleware(
        args as unknown as Parameters<typeof authMiddleware>[0],
        mockNext,
      );

      expect((result as Response).status).toBe(403);
    });

    test("message-less deny serializes a fallback error body (never empty)", async () => {
      vi.mocked(runGates).mockResolvedValue({ kind: "deny", status: 403 });

      const args = createMiddlewareArgs(
        {},
        true,
        new Request("http://localhost/upload", { method: "POST" }),
      );

      const result = await authMiddleware(
        args as unknown as Parameters<typeof authMiddleware>[0],
        mockNext,
      );

      const response = result as Response;
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "Request denied" });
    });

    test("the same gate passing on GET proceeds to credential fetch", async () => {
      // Mirrors a method-aware read-only gate: deny writes, continue on reads.
      vi.mocked(runGates).mockResolvedValue({ kind: "continue" });

      // A reserved-root path — no org in the URL, the derived default drives.
      const args = createMiddlewareArgs(
        {},
        true,
        new Request("http://localhost/recent", { method: "GET" }),
      );

      await authMiddleware(args as unknown as Parameters<typeof authMiddleware>[0], mockNext);

      expect(listConnections).toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    test("continue with org present proceeds to credential fetch", async () => {
      const args = createMiddlewareArgs();

      await authMiddleware(args as unknown as Parameters<typeof authMiddleware>[0], mockNext);

      expect(listConnections).toHaveBeenCalledWith(mockSessionData.user, "org1");
      expect(mockNext).toHaveBeenCalled();
    });

    test("continue with no org falls back to the built-in /onboarding redirect", async () => {
      vi.mocked(runGates).mockResolvedValue({ kind: "continue" });
      vi.mocked(getSessionData).mockResolvedValue({
        ...mockSessionData,
        user: mock.user({ organizations: {} }),
      });

      // Reserved-root path: no org segment for a zero-org session to miss.
      const request = new Request("http://localhost/recent");
      const args = createMiddlewareArgs({}, true, request, new URL(request.url));

      const result = await authMiddleware(
        args as unknown as Parameters<typeof authMiddleware>[0],
        mockNext,
      );

      expect(result).toBeInstanceOf(Response);
      expect(redirect).toHaveBeenCalledWith("/onboarding");
      expect(listConnections).not.toHaveBeenCalled();
      expect(mockNext).not.toHaveBeenCalled();
    });

    test("runs gates BEFORE verifyIdToken (H-1 ordering guard)", async () => {
      // Reordering would let a gate decide on a refreshed token instead of the
      // current one, and could run a tenant-scoped read before the gate.
      const args = createMiddlewareArgs();

      await authMiddleware(args as unknown as Parameters<typeof authMiddleware>[0], mockNext);

      const gateOrder = vi.mocked(runGates).mock.invocationCallOrder[0];
      const verifyOrder = vi.mocked(verifyIdToken).mock.invocationCallOrder[0];
      expect(gateOrder).toBeLessThan(verifyOrder);
    });
  });

  describe("Logout Flow", () => {
    test("redirects to login when both tokens are invalid", async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(null);
      vi.mocked(getSessionData).mockResolvedValue({
        ...mockSessionData,
        authTokens: {
          ...mockSessionData.authTokens,
          refreshToken: expiredRefreshToken,
        },
      });

      const args = createMiddlewareArgs();

      const result = await authMiddleware(
        args as unknown as Parameters<typeof authMiddleware>[0],
        mockNext,
      );

      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(302);
      expect(redirect).toHaveBeenCalledWith(
        expect.stringContaining("/login?redirect="),
        expect.objectContaining({
          headers: expect.objectContaining({
            "Set-Cookie": "destroy-cookie",
          }),
        }),
      );
    });

    test("destroys session on logout", async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(null);
      vi.mocked(getSessionData).mockResolvedValue({
        ...mockSessionData,
        authTokens: {
          ...mockSessionData.authTokens,
          refreshToken: expiredRefreshToken,
        },
      });

      const args = createMiddlewareArgs();

      await authMiddleware(args as unknown as Parameters<typeof authMiddleware>[0], mockNext);

      expect(sessionStorage.destroySession).toHaveBeenCalledWith(mockSession);
    });

    test("redirects to login when session data is incomplete", async () => {
      vi.mocked(getSessionData).mockResolvedValue({
        user: undefined,
        authTokens: undefined,
        credentials: {},
        notification: undefined,
      });

      const args = createMiddlewareArgs();

      const result = await authMiddleware(
        args as unknown as Parameters<typeof authMiddleware>[0],
        mockNext,
      );

      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(302);
      expect(redirect).toHaveBeenCalled();
    });

    test("includes relative URL in redirect for post-login navigation", async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(null);
      vi.mocked(getSessionData).mockResolvedValue({
        ...mockSessionData,
        authTokens: {
          ...mockSessionData.authTokens,
          refreshToken: expiredRefreshToken,
        },
      });

      const args = createMiddlewareArgs(
        {},
        true,
        // A reserved-root path: no org segment, so the logout redirect (not
        // the foreign-org branch) is what handles this request.
        new Request("http://localhost/recent/page?query=test"),
      );

      await authMiddleware(args as unknown as Parameters<typeof authMiddleware>[0], mockNext);

      expect(redirect).toHaveBeenCalledWith(
        `/login?redirect=${encodeURIComponent("/recent/page?query=test")}`,
        expect.any(Object),
      );
    });

    test("uses RR's normalized url arg, stripping single-fetch .data suffix and _routes param from the redirect target", async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(null);
      vi.mocked(getSessionData).mockResolvedValue({
        ...mockSessionData,
        authTokens: {
          ...mockSessionData.authTokens,
          refreshToken: expiredRefreshToken,
        },
      });

      // During keep-alive revalidation, request.url is the raw single-fetch
      // URL; the sibling `url` arg is RR-normalized (.data/_routes stripped).
      const request = new Request(
        "http://localhost/plugin/jobs.data?_routes=routes%2Fplugin%2Fplugin.%24",
      );
      const url = new URL("http://localhost/plugin/jobs");
      const args = createMiddlewareArgs({}, true, request, url);

      await authMiddleware(args as unknown as Parameters<typeof authMiddleware>[0], mockNext);

      expect(redirect).toHaveBeenCalledWith(
        `/login?redirect=${encodeURIComponent("/plugin/jobs")}`,
        expect.any(Object),
      );
    });
  });

  describe("Invalid Token Format", () => {
    test("redirects to login when idToken verification fails and refresh token is malformed", async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(null);
      vi.mocked(getSessionData).mockResolvedValue({
        ...mockSessionData,
        authTokens: {
          ...mockSessionData.authTokens,
          idToken: "invalid-token-format",
          refreshToken: "also-invalid",
        },
      });

      const args = createMiddlewareArgs();

      const result = await authMiddleware(
        args as unknown as Parameters<typeof authMiddleware>[0],
        mockNext,
      );

      expect(result).toBeInstanceOf(Response);
      expect((result as Response).status).toBe(302);
      expect(redirect).toHaveBeenCalled();
    });

    test("returns the redirect Response (does not throw) so RR's single-fetch path can re-encode it cleanly via generateSingleFetchRedirectResponse — throwing lands in singleFetchLoaders' middleware catch and becomes SingleFetchNoResultError on the client", async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(null);
      vi.mocked(getSessionData).mockResolvedValue({
        ...mockSessionData,
        authTokens: {
          ...mockSessionData.authTokens,
          refreshToken: expiredRefreshToken,
        },
      });

      const args = createMiddlewareArgs();

      const promise = authMiddleware(
        args as unknown as Parameters<typeof authMiddleware>[0],
        mockNext,
      );

      await expect(promise).resolves.toBeInstanceOf(Response);
      await expect(promise).resolves.not.toBeUndefined();
    });
  });
});
