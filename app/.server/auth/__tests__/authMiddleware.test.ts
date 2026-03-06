import { redirect } from "react-router";

import { authMiddleware, authContext } from "../authMiddleware";
import { getSessionData } from "../getSession";
import { getAllSessionCredentials } from "../getSessionCredentials";
import { refreshAccessTokenWithLock } from "../refreshAuthTokens";
import { sessionContext } from "../sessionMiddleware";
import { sessionStorage, type SessionData } from "../sessionStorage";
import { verifyIdToken } from "../verifyIdToken";
import mock from "~/utils/__tests__/__mocks__";
import { getConnectionConfigs } from "~/utils/connectionConfig";

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

vi.mock("~/utils/connectionConfig", () => ({
  getConnectionConfigs: vi.fn(),
}));

vi.mock("../verifyIdToken", () => ({
  verifyIdToken: vi.fn(),
}));

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    redirect: vi.fn((url, init) => {
      const error = new Response(null, { status: 302, ...init });
      (error as Response & { url: string }).url = url;
      throw error;
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
  ) => {
    const context = new Map();
    if (hasSession) {
      context.set(sessionContext, mockSession);
    }

    return {
      request: new Request("http://localhost/test"),
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
    vi.mocked(sessionStorage.destroySession).mockResolvedValue(
      "destroy-cookie",
    );
    vi.mocked(getConnectionConfigs).mockResolvedValue(mockConnectionConfigs);
    // Return the same credentials by default (no change = no session commit)
    vi.mocked(getAllSessionCredentials).mockImplementation(
      async (sessionData) => sessionData.credentials,
    );
    vi.mocked(refreshAccessTokenWithLock).mockResolvedValue({
      accessToken: "new-access-token",
      idToken: "new-id-token",
      refreshToken: validRefreshToken,
    });
  });

  describe("Session Context", () => {
    test("throws if sessionMiddleware hasn't run", async () => {
      const args = createMiddlewareArgs({}, false);

      await expect(
        authMiddleware(
          args as unknown as Parameters<typeof authMiddleware>[0],
          mockNext,
        ),
      ).rejects.toThrow(
        "Session not found in context. Ensure sessionMiddleware runs first.",
      );
    });
  });

  describe("Valid Token Flow", () => {
    test("proceeds to next() when idToken is verified", async () => {
      const args = createMiddlewareArgs();

      await authMiddleware(
        args as unknown as Parameters<typeof authMiddleware>[0],
        mockNext,
      );

      expect(verifyIdToken).toHaveBeenCalledWith("valid-id-token");
      expect(mockNext).toHaveBeenCalled();
    });

    test("sets authContext with session data and bucket configs", async () => {
      const args = createMiddlewareArgs();

      await authMiddleware(
        args as unknown as Parameters<typeof authMiddleware>[0],
        mockNext,
      );

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

      await authMiddleware(
        args as unknown as Parameters<typeof authMiddleware>[0],
        mockNext,
      );

      expect(refreshAccessTokenWithLock).not.toHaveBeenCalled();
    });
  });

  describe("Credential Fetching", () => {
    test("fetches all bucket configs and credentials", async () => {
      const args = createMiddlewareArgs();

      await authMiddleware(
        args as unknown as Parameters<typeof authMiddleware>[0],
        mockNext,
      );

      expect(getConnectionConfigs).toHaveBeenCalledWith(mockSessionData.user);
      expect(getAllSessionCredentials).toHaveBeenCalledWith(
        expect.objectContaining({ user: expect.any(Object) }),
        mockConnectionConfigs,
      );
    });

    test("fetches credentials regardless of route params", async () => {
      // Even without bucketName in params, credentials are fetched for all buckets
      const args = createMiddlewareArgs();

      await authMiddleware(
        args as unknown as Parameters<typeof authMiddleware>[0],
        mockNext,
      );

      expect(getAllSessionCredentials).toHaveBeenCalled();
    });

    test("does not commit session when credentials unchanged", async () => {
      const args = createMiddlewareArgs();

      await authMiddleware(
        args as unknown as Parameters<typeof authMiddleware>[0],
        mockNext,
      );

      expect(sessionStorage.commitSession).not.toHaveBeenCalled();
    });

    test("commits session when credentials changed", async () => {
      const newCredentials = { "new-bucket": mock.credentials() };
      vi.mocked(getAllSessionCredentials).mockResolvedValue(newCredentials);

      const args = createMiddlewareArgs();

      await authMiddleware(
        args as unknown as Parameters<typeof authMiddleware>[0],
        mockNext,
      );

      expect(mockSession.set).toHaveBeenCalledWith("credentials", newCredentials);
      expect(sessionStorage.commitSession).toHaveBeenCalledWith(mockSession);
    });

    test("propagates error when credential fetch fails", async () => {
      vi.mocked(getAllSessionCredentials).mockRejectedValue(
        new Error("STS service unavailable"),
      );

      const args = createMiddlewareArgs();

      await expect(
        authMiddleware(
          args as unknown as Parameters<typeof authMiddleware>[0],
          mockNext,
        ),
      ).rejects.toThrow("STS service unavailable");
    });
  });

  describe("Token Refresh Flow", () => {
    test("refreshes tokens when idToken verification fails but refreshToken valid", async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(null);

      const args = createMiddlewareArgs();

      await authMiddleware(
        args as unknown as Parameters<typeof authMiddleware>[0],
        mockNext,
      );

      expect(refreshAccessTokenWithLock).toHaveBeenCalledWith(
        mockSession.id,
        validRefreshToken,
      );
    });

    test("updates session with new tokens after refresh", async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(null);

      const args = createMiddlewareArgs();

      await authMiddleware(
        args as unknown as Parameters<typeof authMiddleware>[0],
        mockNext,
      );

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

      await authMiddleware(
        args as unknown as Parameters<typeof authMiddleware>[0],
        mockNext,
      );

      expect(sessionStorage.commitSession).toHaveBeenCalledWith(mockSession);
    });

    test("proceeds to next() after successful token refresh", async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(null);

      const args = createMiddlewareArgs();

      await authMiddleware(
        args as unknown as Parameters<typeof authMiddleware>[0],
        mockNext,
      );

      expect(mockNext).toHaveBeenCalled();
    });

    test("fetches credentials with refreshed tokens", async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(null);

      const args = createMiddlewareArgs();

      await authMiddleware(
        args as unknown as Parameters<typeof authMiddleware>[0],
        mockNext,
      );

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
      vi.mocked(getAllSessionCredentials).mockRejectedValue(
        new Error("STS service unavailable"),
      );

      const args = createMiddlewareArgs();

      await expect(
        authMiddleware(
          args as unknown as Parameters<typeof authMiddleware>[0],
          mockNext,
        ),
      ).rejects.toThrow("STS service unavailable");
    });

    test("redirects to login when refresh lock exhaustion throws", async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(null);
      vi.mocked(refreshAccessTokenWithLock).mockRejectedValue(
        new Error("Failed to acquire refresh lock after maximum retries"),
      );
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const args = createMiddlewareArgs();

      await expect(
        authMiddleware(
          args as unknown as Parameters<typeof authMiddleware>[0],
          mockNext,
        ),
      ).rejects.toThrow();

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
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const args = createMiddlewareArgs();

      await expect(
        authMiddleware(
          args as unknown as Parameters<typeof authMiddleware>[0],
          mockNext,
        ),
      ).rejects.toThrow();

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

      await expect(
        authMiddleware(
          args as unknown as Parameters<typeof authMiddleware>[0],
          mockNext,
        ),
      ).rejects.toThrow();

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

      try {
        await authMiddleware(
          args as unknown as Parameters<typeof authMiddleware>[0],
          mockNext,
        );
      } catch {
        // Expected redirect
      }

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

      await expect(
        authMiddleware(
          args as unknown as Parameters<typeof authMiddleware>[0],
          mockNext,
        ),
      ).rejects.toThrow();

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
      (args.request as Request) = new Request(
        "http://localhost/protected/page?query=test",
      );

      try {
        await authMiddleware(
          args as unknown as Parameters<typeof authMiddleware>[0],
          mockNext,
        );
      } catch {
        // Expected redirect
      }

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

      await expect(
        authMiddleware(
          args as unknown as Parameters<typeof authMiddleware>[0],
          mockNext,
        ),
      ).rejects.toThrow();

      expect(redirect).toHaveBeenCalled();
    });
  });
});
