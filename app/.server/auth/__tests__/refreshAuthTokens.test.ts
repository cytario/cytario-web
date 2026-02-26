import { redis } from "../../db/redis";
import {
  refreshAccessToken,
  refreshAccessTokenWithLock,
} from "../refreshAuthTokens";
import { getWellKnownEndpoints } from "../wellKnownEndpoints";
import mock from "~/utils/__tests__/__mocks__";

vi.mock("../wellKnownEndpoints", () => ({
  getWellKnownEndpoints: vi.fn(),
}));

vi.mock("~/config", () => ({
  cytarioConfig: {
    auth: {
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
    },
  },
}));

vi.mock("../../db/redis", () => ({
  redis: {
    set: vi.fn(),
    eval: vi.fn(),
    hget: vi.fn(),
  },
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("refreshAccessToken", () => {
  const mockTokenEndpoint = "https://auth.example.com/token";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getWellKnownEndpoints).mockResolvedValue({
      token_endpoint: mockTokenEndpoint,
      authorization_endpoint: "https://auth.example.com/auth",
      revocation_endpoint: "https://auth.example.com/revoke",
      end_session_endpoint: "https://auth.example.com/logout",
      userinfo_endpoint: "https://auth.example.com/userinfo",
      jwks_uri: "https://auth.example.com/certs",
      issuer: "https://auth.example.com/realms/test",
    });
  });

  describe("Success Cases", () => {
    test("returns new tokens on successful refresh", async () => {
      const mockResponse = mock.tokenReponse();
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await refreshAccessToken("test-refresh-token");

      expect(result).toEqual({
        accessToken: mockResponse.access_token,
        idToken: mockResponse.id_token,
        refreshToken: mockResponse.refresh_token,
      });
    });

    test("uses correct token endpoint from wellKnown", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mock.tokenReponse()),
      });

      await refreshAccessToken("test-refresh-token");

      expect(mockFetch).toHaveBeenCalledWith(
        mockTokenEndpoint,
        expect.any(Object),
      );
    });

    test("sends refresh_token grant type", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mock.tokenReponse()),
      });

      await refreshAccessToken("test-refresh-token");

      const [, options] = mockFetch.mock.calls[0];
      const body = new URLSearchParams(options.body);

      expect(body.get("grant_type")).toBe("refresh_token");
    });

    test("includes client credentials in request", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mock.tokenReponse()),
      });

      await refreshAccessToken("test-refresh-token");

      const [, options] = mockFetch.mock.calls[0];
      const body = new URLSearchParams(options.body);

      expect(body.get("client_id")).toBe("test-client-id");
      expect(body.get("client_secret")).toBe("test-client-secret");
    });

    test("includes refresh token in request body", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mock.tokenReponse()),
      });

      await refreshAccessToken("my-refresh-token-123");

      const [, options] = mockFetch.mock.calls[0];
      const body = new URLSearchParams(options.body);

      expect(body.get("refresh_token")).toBe("my-refresh-token-123");
    });

    test("sends correct content type header", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mock.tokenReponse()),
      });

      await refreshAccessToken("test-refresh-token");

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers["Content-Type"]).toBe(
        "application/x-www-form-urlencoded",
      );
    });
  });

  describe("Error Cases", () => {
    test("throws on non-200 response", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
      });

      await expect(refreshAccessToken("expired-token")).rejects.toThrow(
        "Failed to refresh token",
      );
    });

    test("throws on network failure", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      await expect(refreshAccessToken("test-refresh-token")).rejects.toThrow(
        "Network error",
      );
    });
  });
});

describe("refreshAccessTokenWithLock", () => {
  const sessionData = {
    authTokens: {
      accessToken: "old-access",
      idToken: "old-id",
      refreshToken: "refresh-token",
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getWellKnownEndpoints).mockResolvedValue({
      token_endpoint: "https://auth.example.com/token",
      authorization_endpoint: "https://auth.example.com/auth",
      revocation_endpoint: "https://auth.example.com/revoke",
      end_session_endpoint: "https://auth.example.com/logout",
      userinfo_endpoint: "https://auth.example.com/userinfo",
      jwks_uri: "https://auth.example.com/certs",
      issuer: "https://auth.example.com/realms/test",
    });
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mock.tokenReponse()),
    });
    // Default: session has the same refresh token (no prior rotation)
    vi.mocked(redis.hget).mockResolvedValue(JSON.stringify(sessionData));
  });

  test("acquires lock, refreshes token, and releases lock", async () => {
    vi.mocked(redis.set).mockResolvedValue("OK");
    vi.mocked(redis.eval).mockResolvedValue(1);

    const result = await refreshAccessTokenWithLock(
      "session-123",
      "refresh-token",
    );

    // Lock acquired
    expect(redis.set).toHaveBeenCalledWith(
      "refresh_lock:session-123",
      expect.any(String),
      "EX",
      15,
      "NX",
    );

    // Session re-read from Redis after acquiring lock
    expect(redis.hget).toHaveBeenCalledWith("session-123", "data");

    // Token refreshed via Keycloak (since refresh token matches)
    expect(result).toEqual(
      expect.objectContaining({ accessToken: expect.any(String) }),
    );
    expect(mockFetch).toHaveBeenCalled();

    // Lock released via Lua script
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call"),
      1,
      "refresh_lock:session-123",
      expect.any(String),
    );
  });

  test("returns already-refreshed tokens when refresh token was rotated", async () => {
    vi.mocked(redis.set).mockResolvedValue("OK");
    vi.mocked(redis.eval).mockResolvedValue(1);

    // Session in Redis already has a NEW refresh token (rotated by previous lock holder)
    const alreadyRefreshed = {
      authTokens: {
        accessToken: "new-access",
        idToken: "new-id",
        refreshToken: "already-rotated-token",
      },
    };
    vi.mocked(redis.hget).mockResolvedValue(
      JSON.stringify(alreadyRefreshed),
    );

    const result = await refreshAccessTokenWithLock(
      "session-123",
      "old-refresh-token",
    );

    // Should return the already-refreshed tokens without calling Keycloak
    expect(result).toEqual(alreadyRefreshed.authTokens);
    expect(mockFetch).not.toHaveBeenCalled();

    // Lock should still be released
    expect(redis.eval).toHaveBeenCalled();
  });

  test("proceeds with refresh when session has same refresh token", async () => {
    vi.mocked(redis.set).mockResolvedValue("OK");
    vi.mocked(redis.eval).mockResolvedValue(1);

    // Session still has the same refresh token — no rotation happened
    vi.mocked(redis.hget).mockResolvedValue(
      JSON.stringify({
        authTokens: {
          accessToken: "old-access",
          idToken: "old-id",
          refreshToken: "same-refresh-token",
        },
      }),
    );

    const result = await refreshAccessTokenWithLock(
      "session-123",
      "same-refresh-token",
    );

    // Should call Keycloak since tokens were not rotated
    expect(mockFetch).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({ accessToken: expect.any(String) }),
    );
  });

  test("proceeds with refresh when session data is missing", async () => {
    vi.mocked(redis.set).mockResolvedValue("OK");
    vi.mocked(redis.eval).mockResolvedValue(1);
    vi.mocked(redis.hget).mockResolvedValue(null);

    const result = await refreshAccessTokenWithLock(
      "session-123",
      "refresh-token",
    );

    // Should call Keycloak since no session data exists
    expect(mockFetch).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({ accessToken: expect.any(String) }),
    );
  });

  test("releases lock even when refresh fails", async () => {
    vi.mocked(redis.set).mockResolvedValue("OK");
    vi.mocked(redis.eval).mockResolvedValue(1);
    mockFetch.mockResolvedValue({ ok: false, status: 401 });

    await expect(
      refreshAccessTokenWithLock("session-123", "refresh-token"),
    ).rejects.toThrow("Failed to refresh token");

    // Lock should still be released in finally block
    expect(redis.eval).toHaveBeenCalled();
  });

  test("retries when lock is held by another process", async () => {
    // First attempt: lock not acquired (null), second: acquired (OK)
    vi.mocked(redis.set)
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce("OK");
    vi.mocked(redis.eval).mockResolvedValue(1);

    const result = await refreshAccessTokenWithLock(
      "session-123",
      "refresh-token",
    );

    expect(redis.set).toHaveBeenCalledTimes(2);
    expect(result).toEqual(
      expect.objectContaining({ accessToken: expect.any(String) }),
    );
  });

  test("throws after exhausting all retries", async () => {
    // All attempts fail to acquire lock
    vi.mocked(redis.set).mockResolvedValue(null as never);

    await expect(
      refreshAccessTokenWithLock("session-123", "refresh-token"),
    ).rejects.toThrow(
      "Failed to acquire refresh lock after maximum retries",
    );

    expect(redis.set).toHaveBeenCalledTimes(10);
    // No lock to release since it was never acquired
    expect(redis.eval).not.toHaveBeenCalled();
  });
});
