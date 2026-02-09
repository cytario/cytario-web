import { redirect } from "react-router";

import { authMiddleware, authContext } from "../authMiddleware";
import { getSessionData } from "../getSession";
import { getAllSessionCredentials } from "../getSessionCredentials";
import { refreshAccessToken } from "../refreshAuthTokens";
import { sessionContext } from "../sessionMiddleware";
import { sessionStorage, type SessionData } from "../sessionStorage";
import mock from "~/utils/__tests__/__mocks__";
import { getBucketConfigs } from "~/utils/bucketConfig";

vi.mock("../getSession", () => ({
  getSessionData: vi.fn(),
}));

vi.mock("../getSessionCredentials", () => ({
  getAllSessionCredentials: vi.fn(),
}));

vi.mock("../refreshAuthTokens", () => ({
  refreshAccessToken: vi.fn(),
}));

vi.mock("../sessionStorage", () => ({
  sessionStorage: {
    commitSession: vi.fn(),
    destroySession: vi.fn(),
  },
}));

vi.mock("~/utils/bucketConfig", () => ({
  getBucketConfigs: vi.fn(),
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
  const mockNext = vi.fn().mockResolvedValue(new Response("OK"));
  const mockSession = mock.session();
  const mockBucketConfigs = [mock.bucketConfig()];

  // Create valid tokens (not expired)
  const validIdToken = mock.idToken({ exp: Math.floor(Date.now() / 1000) + 3600 });
  const validRefreshToken = mock.idToken({ exp: Math.floor(Date.now() / 1000) + 86400 });

  // Create expired tokens
  const expiredIdToken = mock.idToken({ exp: Math.floor(Date.now() / 1000) - 3600 });
  const expiredRefreshToken = mock.idToken({ exp: Math.floor(Date.now() / 1000) - 3600 });

  const mockSessionData = {
    user: mock.user(),
    authTokens: {
      accessToken: "access-token",
      idToken: validIdToken,
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
    vi.mocked(getSessionData).mockResolvedValue(mockSessionData);
    vi.mocked(sessionStorage.commitSession).mockResolvedValue("session-cookie");
    vi.mocked(sessionStorage.destroySession).mockResolvedValue("destroy-cookie");
    vi.mocked(getBucketConfigs).mockResolvedValue(mockBucketConfigs);
    // Return the same credentials by default (no change = no session commit)
    vi.mocked(getAllSessionCredentials).mockImplementation(
      async (sessionData) => sessionData.credentials,
    );
    vi.mocked(refreshAccessToken).mockResolvedValue({
      accessToken: "new-access-token",
      idToken: validIdToken,
      refreshToken: validRefreshToken,
    });
  });

  describe("Session Context", () => {
    test("throws if sessionMiddleware hasn't run", async () => {
      const args = createMiddlewareArgs({}, false);

      await expect(
        authMiddleware(args as unknown as Parameters<typeof authMiddleware>[0], mockNext),
      ).rejects.toThrow(
        "Session not found in context. Ensure sessionMiddleware runs first.",
      );
    });
  });

  describe("Valid Token Flow", () => {
    test("proceeds to next() when idToken is valid", async () => {
      const args = createMiddlewareArgs();

      await authMiddleware(
        args as unknown as Parameters<typeof authMiddleware>[0],
        mockNext,
      );

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

    test("does not refresh tokens when idToken is valid", async () => {
      const args = createMiddlewareArgs();

      await authMiddleware(
        args as unknown as Parameters<typeof authMiddleware>[0],
        mockNext,
      );

      expect(refreshAccessToken).not.toHaveBeenCalled();
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
  });

  describe("Token Refresh Flow", () => {
    test("refreshes tokens when idToken expired but refreshToken valid", async () => {
      vi.mocked(getSessionData).mockResolvedValue({
        ...mockSessionData,
        authTokens: {
          ...mockSessionData.authTokens,
          idToken: expiredIdToken,
          refreshToken: validRefreshToken,
        },
      });

      const args = createMiddlewareArgs();

      await authMiddleware(
        args as unknown as Parameters<typeof authMiddleware>[0],
        mockNext,
      );

      expect(refreshAccessToken).toHaveBeenCalledWith(validRefreshToken);
    });

    test("updates session with new tokens after refresh", async () => {
      vi.mocked(getSessionData).mockResolvedValue({
        ...mockSessionData,
        authTokens: {
          ...mockSessionData.authTokens,
          idToken: expiredIdToken,
          refreshToken: validRefreshToken,
        },
      });

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
      vi.mocked(getSessionData).mockResolvedValue({
        ...mockSessionData,
        authTokens: {
          ...mockSessionData.authTokens,
          idToken: expiredIdToken,
          refreshToken: validRefreshToken,
        },
      });

      const args = createMiddlewareArgs();

      await authMiddleware(
        args as unknown as Parameters<typeof authMiddleware>[0],
        mockNext,
      );

      expect(sessionStorage.commitSession).toHaveBeenCalledWith(mockSession);
    });

    test("proceeds to next() after successful token refresh", async () => {
      vi.mocked(getSessionData).mockResolvedValue({
        ...mockSessionData,
        authTokens: {
          ...mockSessionData.authTokens,
          idToken: expiredIdToken,
          refreshToken: validRefreshToken,
        },
      });

      const args = createMiddlewareArgs();

      await authMiddleware(
        args as unknown as Parameters<typeof authMiddleware>[0],
        mockNext,
      );

      expect(mockNext).toHaveBeenCalled();
    });

    test("fetches credentials with refreshed tokens", async () => {
      vi.mocked(getSessionData).mockResolvedValue({
        ...mockSessionData,
        authTokens: {
          ...mockSessionData.authTokens,
          idToken: expiredIdToken,
          refreshToken: validRefreshToken,
        },
      });

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
  });

  describe("Logout Flow", () => {
    test("redirects to login when both tokens expired", async () => {
      vi.mocked(getSessionData).mockResolvedValue({
        ...mockSessionData,
        authTokens: {
          ...mockSessionData.authTokens,
          idToken: expiredIdToken,
          refreshToken: expiredRefreshToken,
        },
      });

      const args = createMiddlewareArgs();

      await expect(
        authMiddleware(args as unknown as Parameters<typeof authMiddleware>[0], mockNext),
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
      vi.mocked(getSessionData).mockResolvedValue({
        ...mockSessionData,
        authTokens: {
          ...mockSessionData.authTokens,
          idToken: expiredIdToken,
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
        authMiddleware(args as unknown as Parameters<typeof authMiddleware>[0], mockNext),
      ).rejects.toThrow();

      expect(redirect).toHaveBeenCalled();
    });

    test("includes original URL in redirect for post-login navigation", async () => {
      vi.mocked(getSessionData).mockResolvedValue({
        ...mockSessionData,
        authTokens: {
          ...mockSessionData.authTokens,
          idToken: expiredIdToken,
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
        expect.stringContaining(encodeURIComponent("/protected/page?query=test")),
        expect.any(Object),
      );
    });
  });

  describe("Invalid Token Format", () => {
    test("redirects to login when idToken is malformed", async () => {
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
        authMiddleware(args as unknown as Parameters<typeof authMiddleware>[0], mockNext),
      ).rejects.toThrow();

      expect(redirect).toHaveBeenCalled();
    });
  });
});
