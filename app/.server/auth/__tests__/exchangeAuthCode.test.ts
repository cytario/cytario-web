import { exchangeAuthCode } from "../exchangeAuthCode";
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

describe("exchangeAuthCode", () => {
  const mockTokenEndpoint = "https://keycloak.example.com/token";
  const mockCode = "auth-code-123";
  const mockRedirectUri = "https://app.example.com/auth/callback";

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(getWellKnownEndpoints).mockResolvedValue({
      token_endpoint: mockTokenEndpoint,
      authorization_endpoint: "https://keycloak.example.com/auth",
      userinfo_endpoint: "https://keycloak.example.com/userinfo",
      end_session_endpoint: "https://keycloak.example.com/logout",
      revocation_endpoint: "https://keycloak.example.com/revoke",
    });
  });

  test("exchanges authorization code for tokens", async () => {
    const mockTokenResponse = mock.tokenReponse();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockTokenResponse),
    });

    const result = await exchangeAuthCode(mockCode, mockRedirectUri);

    expect(result).toEqual(mockTokenResponse);
  });

  test("uses correct token endpoint from wellKnown", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mock.tokenReponse()),
    });

    await exchangeAuthCode(mockCode, mockRedirectUri);

    expect(fetch).toHaveBeenCalledWith(
      mockTokenEndpoint,
      expect.any(Object)
    );
  });

  test("sends authorization_code grant type", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mock.tokenReponse()),
    });

    await exchangeAuthCode(mockCode, mockRedirectUri);

    const fetchCall = vi.mocked(fetch).mock.calls[0];
    const body = fetchCall[1]?.body as URLSearchParams;

    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe(mockCode);
    expect(body.get("redirect_uri")).toBe(mockRedirectUri);
  });

  test("includes Basic auth header with client credentials", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mock.tokenReponse()),
    });

    await exchangeAuthCode(mockCode, mockRedirectUri);

    const fetchCall = vi.mocked(fetch).mock.calls[0];
    const headers = fetchCall[1]?.headers as Record<string, string>;

    const expectedAuth = Buffer.from("test-client-id:test-client-secret").toString("base64");
    expect(headers.Authorization).toBe(`Basic ${expectedAuth}`);
  });

  test("sends application/x-www-form-urlencoded content type", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mock.tokenReponse()),
    });

    await exchangeAuthCode(mockCode, mockRedirectUri);

    const fetchCall = vi.mocked(fetch).mock.calls[0];
    const headers = fetchCall[1]?.headers as Record<string, string>;

    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
  });

  test("throws error on non-200 response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve("invalid_grant: Code expired"),
    });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(exchangeAuthCode(mockCode, mockRedirectUri)).rejects.toThrow(
      "Token exchange failed: 400 - invalid_grant: Code expired"
    );

    consoleSpy.mockRestore();
  });

  test("throws error on network failure", async () => {
    const networkError = new Error("Network error");
    global.fetch = vi.fn().mockRejectedValue(networkError);
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(exchangeAuthCode(mockCode, mockRedirectUri)).rejects.toThrow(
      "Network error"
    );

    expect(consoleSpy).toHaveBeenCalledWith(
      "Authorization code exchange failed:",
      networkError
    );
    consoleSpy.mockRestore();
  });

  test("logs error on failure", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal server error"),
    });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      await exchangeAuthCode(mockCode, mockRedirectUri);
    } catch {
      // Expected to throw
    }

    expect(consoleSpy).toHaveBeenCalledWith(
      "Authorization code exchange failed:",
      expect.any(Error)
    );
    consoleSpy.mockRestore();
  });
});
