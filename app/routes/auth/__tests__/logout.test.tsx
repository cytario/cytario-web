import { LoaderFunctionArgs } from "react-router";

import { loader } from "../logout.route";
import { getSession, getSessionData } from "~/.server/auth/getSession";
import { sessionStorage } from "~/.server/auth/sessionStorage";
import { getWellKnownEndpoints } from "~/.server/auth/wellKnownEndpoints";
import mock from "~/utils/__tests__/__mocks__";

vi.mock("~/.server/auth/getSession", () => ({
  getSession: vi.fn(),
  getSessionData: vi.fn(),
}));

vi.mock("~/.server/auth/sessionStorage", () => ({
  sessionStorage: {
    destroySession: vi.fn().mockResolvedValue("destroy-cookie"),
  },
}));

vi.mock("~/.server/auth/wellKnownEndpoints", () => ({
  getWellKnownEndpoints: vi.fn(),
}));

vi.mock("~/config", () => ({
  cytarioConfig: {
    endpoints: { webapp: "https://app.example.com" },
    auth: {
      clientId: "test-client-id",
      clientSecret: "test-client-secret",
    },
  },
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("logout loader", () => {
  const mockSession = mock.session();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue(mockSession);
    vi.mocked(getWellKnownEndpoints).mockResolvedValue({
      authorization_endpoint: "https://auth.example.com/auth",
      token_endpoint: "https://auth.example.com/token",
      revocation_endpoint: "https://auth.example.com/revoke",
      end_session_endpoint: "https://auth.example.com/logout",
      userinfo_endpoint: "https://auth.example.com/userinfo",
      jwks_uri: "https://auth.example.com/certs",
      issuer: "https://auth.example.com/realms/test",
    });
    mockFetch.mockResolvedValue({ ok: true });
  });

  test("revokes refresh token before logout", async () => {
    vi.mocked(getSessionData).mockResolvedValue({
      user: mock.user(),
      authTokens: {
        accessToken: "access-token",
        idToken: "id-token",
        refreshToken: "refresh-token-to-revoke",
      },
      credentials: {},
      notification: undefined,
    });

    const request = new Request("http://localhost/logout");
    await loader({ request } as LoaderFunctionArgs);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://auth.example.com/revoke",
      expect.objectContaining({
        method: "POST",
      }),
    );

    const [, options] = mockFetch.mock.calls[0];
    const body = new URLSearchParams(options.body);
    expect(body.get("token")).toBe("refresh-token-to-revoke");
    expect(body.get("token_type_hint")).toBe("refresh_token");
  });

  test("sends Basic Auth header for revocation", async () => {
    vi.mocked(getSessionData).mockResolvedValue({
      user: mock.user(),
      authTokens: {
        accessToken: "access",
        idToken: "id",
        refreshToken: "refresh",
      },
      credentials: {},
      notification: undefined,
    });

    const request = new Request("http://localhost/logout");
    await loader({ request } as LoaderFunctionArgs);

    const [, options] = mockFetch.mock.calls[0];
    const expectedAuth = Buffer.from(
      "test-client-id:test-client-secret",
    ).toString("base64");
    expect(options.headers.Authorization).toBe(`Basic ${expectedAuth}`);
  });

  test("continues with logout even when revocation fails", async () => {
    vi.mocked(getSessionData).mockResolvedValue({
      user: mock.user(),
      authTokens: {
        accessToken: "access",
        idToken: "id",
        refreshToken: "refresh",
      },
      credentials: {},
      notification: undefined,
    });
    mockFetch.mockRejectedValue(new Error("Network error"));
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const request = new Request("http://localhost/logout");
    const response = await loader({ request } as LoaderFunctionArgs);

    // Should still redirect (not crash)
    expect(response.status).toBe(302);
    expect(sessionStorage.destroySession).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  test("skips revocation when no refresh token", async () => {
    vi.mocked(getSessionData).mockResolvedValue({
      user: undefined,
      authTokens: undefined,
      credentials: {},
      notification: undefined,
    });

    const request = new Request("http://localhost/logout");
    await loader({ request } as LoaderFunctionArgs);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("destroys session and redirects to Keycloak logout", async () => {
    vi.mocked(getSessionData).mockResolvedValue({
      user: mock.user(),
      authTokens: {
        accessToken: "access",
        idToken: "id-token-hint",
        refreshToken: "refresh",
      },
      credentials: {},
      notification: undefined,
    });

    const request = new Request("http://localhost/logout");
    const response = await loader({ request } as LoaderFunctionArgs);

    expect(response.status).toBe(302);
    const location = response.headers.get("Location");
    expect(location).toContain("https://auth.example.com/logout");
    expect(location).toContain("id_token_hint=id-token-hint");
    expect(sessionStorage.destroySession).toHaveBeenCalledWith(mockSession);
  });
});
