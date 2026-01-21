import { refreshAccessToken } from "../refreshAuthTokens";
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
        expect.any(Object)
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
        "application/x-www-form-urlencoded"
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
        "Failed to refresh token"
      );
    });

    test("throws on network failure", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      await expect(refreshAccessToken("test-refresh-token")).rejects.toThrow(
        "Network error"
      );
    });
  });

  describe("Token Format", () => {
    test("maps response fields to AuthTokens format", async () => {
      const mockResponse = {
        access_token: "new-access-token-abc",
        id_token: "new-id-token-xyz",
        refresh_token: "new-refresh-token-123",
        expires_in: 300,
        refresh_expires_in: 1800,
        token_type: "Bearer" as const,
        scope: "openid profile email",
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await refreshAccessToken("old-refresh-token");

      expect(result).toEqual({
        accessToken: "new-access-token-abc",
        idToken: "new-id-token-xyz",
        refreshToken: "new-refresh-token-123",
      });
    });
  });
});
