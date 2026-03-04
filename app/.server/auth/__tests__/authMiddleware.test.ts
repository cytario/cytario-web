import { redirect } from "react-router";

import { authMiddleware, authContext, isRefreshTokenValid } from "../authMiddleware";
import { getSessionData } from "../getSession";
import { getAllSessionCredentials } from "../getSessionCredentials";
import {
  refreshAccessTokenWithLock,
  TokenRefreshError,
} from "../refreshAuthTokens";
import { sessionContext } from "../sessionMiddleware";
import { sessionStorage, type SessionData } from "../sessionStorage";
import {
  IdTokenVerificationError,
  verifyIdToken,
} from "../verifyIdToken";
import mock from "~/utils/__tests__/__mocks__";
import { getBucketConfigs } from "~/utils/bucketConfig";

vi.mock("../getSession", () => ({
  getSessionData: vi.fn(),
}));

vi.mock("../getSessionCredentials", () => ({
  getAllSessionCredentials: vi.fn(),
}));

vi.mock("../refreshAuthTokens", () => {
  class TokenRefreshError extends Error {
    readonly retryable: boolean;
    constructor(message: string, retryable: boolean) {
      super(message);
      this.name = "TokenRefreshError";
      this.retryable = retryable;
    }
  }
  return {
    refreshAccessTokenWithLock: vi.fn(),
    TokenRefreshError,
  };
});

vi.mock("../sessionStorage", () => ({
  sessionStorage: {
    commitSession: vi.fn(),
    destroySession: vi.fn(),
  },
}));

vi.mock("~/utils/bucketConfig", () => ({
  getBucketConfigs: vi.fn(),
}));

vi.mock("../verifyIdToken", () => {
  class IdTokenVerificationError extends Error {
    readonly retryable: boolean;
    constructor(message: string, retryable: boolean, cause?: unknown) {
      super(message, { cause });
      this.name = "IdTokenVerificationError";
      this.retryable = retryable;
    }
  }
  return {
    verifyIdToken: vi.fn(),
    IdTokenVerificationError,
  };
});

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
  const mockBucketConfigs = [mock.bucketConfig()];

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
    vi.mocked(getBucketConfigs).mockResolvedValue(mockBucketConfigs);
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
          bucketConfigs: mockBucketConfigs,
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

      expect(getBucketConfigs).toHaveBeenCalledWith(mockSessionData.user);
      expect(getAllSessionCredentials).toHaveBeenCalledWith(
        expect.objectContaining({ user: expect.any(Object) }),
        mockBucketConfigs,
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
        mockBucketConfigs,
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

    test("returns 503 when retryable TokenRefreshError is thrown", async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(null);
      vi.mocked(refreshAccessTokenWithLock).mockRejectedValue(
        new TokenRefreshError("Failed to acquire refresh lock", true),
      );
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const args = createMiddlewareArgs();

      try {
        await authMiddleware(
          args as unknown as Parameters<typeof authMiddleware>[0],
          mockNext,
        );
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(Response);
        expect((error as Response).status).toBe(503);
      }

      expect(mockNext).not.toHaveBeenCalled();
      expect(sessionStorage.destroySession).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test("redirects to login when non-retryable TokenRefreshError is thrown", async () => {
      vi.mocked(verifyIdToken).mockResolvedValue(null);
      vi.mocked(refreshAccessTokenWithLock).mockRejectedValue(
        new TokenRefreshError("Failed to refresh token (HTTP 400)", false),
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

  describe("Clock Tolerance", () => {
    test("isRefreshTokenValid returns true for token expiring within 30s tolerance", () => {
      // Token that expired 15 seconds ago — within 30s tolerance
      const token = mock.idToken({
        exp: Math.floor(Date.now() / 1000) - 15,
      });
      expect(isRefreshTokenValid(token)).toBe(true);
    });

    test("isRefreshTokenValid returns false for token expired beyond 30s tolerance", () => {
      const token = mock.idToken({
        exp: Math.floor(Date.now() / 1000) - 60,
      });
      expect(isRefreshTokenValid(token)).toBe(false);
    });

    test("isRefreshTokenValid returns true for token not yet expired", () => {
      const token = mock.idToken({
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      expect(isRefreshTokenValid(token)).toBe(true);
    });

    test("isRefreshTokenValid returns false for undefined token", () => {
      expect(isRefreshTokenValid(undefined)).toBe(false);
    });
  });

  describe("JWKS Verification Errors", () => {
    test("returns 503 when verifyIdToken throws retryable IdTokenVerificationError", async () => {
      vi.mocked(verifyIdToken).mockRejectedValue(
        new IdTokenVerificationError("JWKS fetch timed out", true),
      );
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const args = createMiddlewareArgs();

      try {
        await authMiddleware(
          args as unknown as Parameters<typeof authMiddleware>[0],
          mockNext,
        );
        expect.unreachable("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(Response);
        expect((error as Response).status).toBe(503);
      }

      // Should NOT attempt token refresh — this is an infrastructure error, not an expired token
      expect(refreshAccessTokenWithLock).not.toHaveBeenCalled();
      expect(mockNext).not.toHaveBeenCalled();
      // Should NOT destroy the session — transient errors are not auth failures
      expect(sessionStorage.destroySession).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test("re-throws non-retryable IdTokenVerificationError", async () => {
      const error = new IdTokenVerificationError(
        "Unexpected verification error",
        false,
      );
      vi.mocked(verifyIdToken).mockRejectedValue(error);

      const args = createMiddlewareArgs();

      await expect(
        authMiddleware(
          args as unknown as Parameters<typeof authMiddleware>[0],
          mockNext,
        ),
      ).rejects.toThrow(error);

      expect(refreshAccessTokenWithLock).not.toHaveBeenCalled();
      expect(mockNext).not.toHaveBeenCalled();
    });

    test("verifyIdToken returning null still triggers refresh flow", async () => {
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
      expect(mockNext).toHaveBeenCalled();
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
