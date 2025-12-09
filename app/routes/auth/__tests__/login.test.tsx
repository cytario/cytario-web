import { LoaderFunctionArgs } from "react-router";
import { Mock } from "vitest";

import { loader } from "../login.route";
import { generateOAuthState } from "~/.server/auth/oauthState";
import { getWellKnownEndpoints } from "~/.server/auth/wellKnownEndpoints";

vi.mock("~/.server/auth/oauthState", () => ({
  generateOAuthState: vi.fn(),
}));

vi.mock("~/.server/auth/wellKnownEndpoints", () => ({
  getWellKnownEndpoints: vi.fn(),
}));

vi.mock("~/.server/auth/getSession", () => ({
  getSession: vi.fn(),
}));

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    // @ts-ignore
    ...actual,
    redirect: vi.fn((url) => new Response(null, { status: 302, headers: { Location: url } })),
  };
});

const { getSession } = await import("~/.server/auth/getSession");
const { redirect } = await import("react-router");

/**
 * Tests for OAuth 2.0 Authorization Code Flow login
 *
 * The login route now redirects to Keycloak instead of handling credentials directly.
 */
describe("login loader (OAuth Authorization Code Flow)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("redirects authenticated users to home", async () => {
    const mockSession = {
      get: vi.fn((key) => key === "user" ? { sub: "123", email: "test@example.com" } : null),
    };

    (getSession as Mock).mockResolvedValue(mockSession);

    const request = new Request("http://localhost/login");
    await loader({ request } as LoaderFunctionArgs);

    expect(redirect).toHaveBeenCalledWith("/");
  });

  test("redirects to Keycloak authorization endpoint for unauthenticated users", async () => {
    const mockSession = {
      get: vi.fn(() => null),
    };

    (getSession as Mock).mockResolvedValue(mockSession);
    (generateOAuthState as Mock).mockResolvedValue("random-state-123");
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
  });

  test("preserves redirect parameter in OAuth state", async () => {
    const mockSession = {
      get: vi.fn(() => null),
    };

    (getSession as Mock).mockResolvedValue(mockSession);
    (generateOAuthState as Mock).mockResolvedValue("random-state-456");
    (getWellKnownEndpoints as Mock).mockResolvedValue({
      authorization_endpoint: "https://keycloak.example.com/auth",
    });

    const request = new Request("http://localhost/login?redirect=/profile");
    await loader({ request } as LoaderFunctionArgs);

    expect(generateOAuthState).toHaveBeenCalledWith("/profile");
  });
});
