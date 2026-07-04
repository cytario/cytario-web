import { redirect } from "react-router";

import { authMiddleware, authContext } from "../authMiddleware";
import { getSessionData } from "../getSession";
import { getAllSessionCredentials } from "../getSessionCredentials";
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
      accessToken: "access-token",
      idToken: "valid-id-token",
      refreshToken: validRefreshToken,
    },
    credentials: {},
    notification: undefined,
  } satisfies SessionData;

  const createMiddlewareArgs = (
    params: Record<string, string> = {},
    hasSession = true,
    request: Request = new Request("http://localhost/test"),
  ) => {
    const context = new Map();
    if (hasSession) {
      context.set(sessionContext, mockSession);
    }

    return {
      request,
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
    // Return the same credentials by default (no change = no session commit)
    vi.mocked(getAllSessionCredentials).mockImplementation(async (sessionData) => ({
      credentials: sessionData.credentials,
      errors: {},
      providers: {},
    }));
    vi.mocked(refreshAccessTokenWithLock).mockResolvedValue({
      accessToken: "new-access-token",
      idToken: "new-id-token",
      refreshToken: validRefreshToken,
    });
    // No plugin loaded by default → gates short-circuit to continue.
    vi.mocked(runGates).mockResolvedValue({ kind: "continue" });
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

      expect(listConnections).toHaveBeenCalledWith(mockSessionData.user);
      expect(getAllSessionCredentials).toHaveBeenCalledWith(
        expect.objectContaining({ user: expect.any(Object) }),
        mockConnectionConfigs,
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

      expect(mockSession.set).toHaveBeenCalledWith("credentials", newCredentials);
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

  describe("Token Refresh Flow", () => {
    test("refreshes tokens when idToken verification fails but refreshToken valid", async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(null);

      const args = createMiddlewareArgs();

      await authMiddleware(args as unknown as Parameters<typeof authMiddleware>[0], mockNext);

      expect(refreshAccessTokenWithLock).toHaveBeenCalledWith(mockSession.id, validRefreshToken);
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
    test("redirects zero-org sessions to /onboarding before fetching credentials", async () => {
      vi.mocked(getSessionData).mockResolvedValue({
        ...mockSessionData,
        user: mock.user({ organization: undefined }),
      });

      const args = createMiddlewareArgs();

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

    test("passes url, method, and the PII-free identity projection to the gate", async () => {
      const args = createMiddlewareArgs(
        {},
        true,
        new Request("http://localhost/protected", { method: "POST" }),
      );

      await authMiddleware(args as unknown as Parameters<typeof authMiddleware>[0], mockNext);

      expect(runGates).toHaveBeenCalledWith({
        url: "http://localhost/protected",
        method: "POST",
        identity: expect.objectContaining({ organization: "org1" }),
      });
      const [{ identity }] = vi.mocked(runGates).mock.calls[0];
      expect(identity).not.toHaveProperty("email");
      expect(identity).not.toHaveProperty("name");
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

      const args = createMiddlewareArgs(
        {},
        true,
        new Request("http://localhost/slide", { method: "GET" }),
      );

      await authMiddleware(args as unknown as Parameters<typeof authMiddleware>[0], mockNext);

      expect(listConnections).toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    test("continue with org present proceeds to credential fetch", async () => {
      const args = createMiddlewareArgs();

      await authMiddleware(args as unknown as Parameters<typeof authMiddleware>[0], mockNext);

      expect(listConnections).toHaveBeenCalledWith(mockSessionData.user);
      expect(mockNext).toHaveBeenCalled();
    });

    test("continue with no org falls back to the built-in /onboarding redirect", async () => {
      vi.mocked(runGates).mockResolvedValue({ kind: "continue" });
      vi.mocked(getSessionData).mockResolvedValue({
        ...mockSessionData,
        user: mock.user({ organization: undefined }),
      });

      const args = createMiddlewareArgs();

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

      const args = createMiddlewareArgs();
      (args.request as Request) = new Request("http://localhost/protected/page?query=test");

      await authMiddleware(args as unknown as Parameters<typeof authMiddleware>[0], mockNext);

      expect(redirect).toHaveBeenCalledWith(
        `/login?redirect=${encodeURIComponent("/protected/page?query=test")}`,
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
