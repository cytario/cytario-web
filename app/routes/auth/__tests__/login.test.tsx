import { LoaderFunctionArgs } from "react-router";
import { Mock } from "vitest";

import { loader } from "../login.route";
import { generateOAuthState, validateRedirectTo } from "~/.server/auth/oauthState";
import { getWellKnownEndpoints } from "~/.server/auth/wellKnownEndpoints";

vi.mock("~/.server/auth/oauthState", () => ({
  generateOAuthState: vi.fn(),
  validateRedirectTo: vi.fn((v: string) => v || "/"),
}));

vi.mock("~/.server/auth/wellKnownEndpoints", () => ({
  getWellKnownEndpoints: vi.fn(),
}));

vi.mock("~/.server/auth/getSession", () => ({
  getSession: vi.fn(),
}));

vi.mock("~/.server/auth/sessionStorage", () => ({
  sessionStorage: {
    commitSession: vi.fn().mockResolvedValue("session-cookie"),
  },
}));

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    // @ts-ignore
    ...actual,
    redirect: vi.fn(
      (url, init) => new Response(null, { status: 302, headers: { Location: url, ...init?.headers } }),
    ),
  };
});

const { getSession } = await import("~/.server/auth/getSession");
const { redirect } = await import("react-router");

/**
 * Tests for OAuth 2.0 Authorization Code Flow login with PKCE
 */
describe("login loader (OAuth Authorization Code Flow with PKCE)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("redirects authenticated users to home", async () => {
    const mockSession = {
      get: vi.fn((key) =>
        key === "user" ? { sub: "123", email: "test@example.com" } : null,
      ),
    };

    (getSession as Mock).mockResolvedValue(mockSession);

    const request = new Request("http://localhost/login");
    await loader({ request } as LoaderFunctionArgs);

    expect(redirect).toHaveBeenCalledWith("/");
  });

  test("redirects to Keycloak with PKCE and nonce params", async () => {
    const mockSession = {
      get: vi.fn(() => null),
      set: vi.fn(),
    };

    (getSession as Mock).mockResolvedValue(mockSession);
    (generateOAuthState as Mock).mockResolvedValue({
      state: "random-state-123",
      codeChallenge: "test-challenge",
      nonce: "test-nonce",
    });
    (getWellKnownEndpoints as Mock).mockResolvedValue({
      authorization_endpoint: "https://keycloak.example.com/auth",
    });

    const request = new Request("http://localhost/login");
    await loader({ request } as LoaderFunctionArgs);

    expect(generateOAuthState).toHaveBeenCalled();
    expect(redirect).toHaveBeenCalled();

    const redirectCall = (redirect as Mock).mock.calls[0][0];
    expect(redirectCall).toContain("https://keycloak.example.com/auth");
    expect(redirectCall).toContain("response_type=code");
    expect(redirectCall).toContain("state=random-state-123");
    expect(redirectCall).toContain("code_challenge=test-challenge");
    expect(redirectCall).toContain("code_challenge_method=S256");
    expect(redirectCall).toContain("nonce=test-nonce");
  });

  test("calls validateRedirectTo on redirect param", async () => {
    const mockSession = {
      get: vi.fn(() => null),
      set: vi.fn(),
    };

    (getSession as Mock).mockResolvedValue(mockSession);
    (generateOAuthState as Mock).mockResolvedValue({
      state: "state-456",
      codeChallenge: "challenge",
      nonce: "nonce",
    });
    (getWellKnownEndpoints as Mock).mockResolvedValue({
      authorization_endpoint: "https://keycloak.example.com/auth",
    });

    const request = new Request("http://localhost/login?redirect=/profile");
    await loader({ request } as LoaderFunctionArgs);

    expect(validateRedirectTo).toHaveBeenCalledWith("/profile");
  });

  test("redirects to /login with flash notification on error", async () => {
    const mockSession = {
      get: vi.fn(() => null),
      set: vi.fn(),
    };

    (getSession as Mock).mockResolvedValue(mockSession);
    (generateOAuthState as Mock).mockRejectedValue(
      new Error("Redis connection failed"),
    );
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const request = new Request("http://localhost/login");
    await loader({ request } as LoaderFunctionArgs);

    expect(mockSession.set).toHaveBeenCalledWith("notification", {
      status: "error",
      message:
        "Unable to connect to authentication service. Please try again.",
    });
    expect(redirect).toHaveBeenCalledWith("/login", expect.any(Object));
    consoleSpy.mockRestore();
  });
});
