import { LoaderFunctionArgs } from "react-router";
import { Mock } from "vitest";

import { loader } from "../refresh.route";
import { generateOAuthState, validateRedirectTo } from "~/.server/auth/oauthState";
import { getWellKnownEndpoints } from "~/.server/auth/wellKnownEndpoints";

vi.mock("~/.server/auth/getSession", () => ({
  getSession: vi.fn(),
}));

vi.mock("~/.server/auth/oauthState", () => ({
  generateOAuthState: vi.fn(),
  validateRedirectTo: vi.fn((v?: string) => {
    if (!v) return "/";
    return v.startsWith("/") ? v : "/";
  }),
}));

vi.mock("~/.server/auth/wellKnownEndpoints", () => ({
  getWellKnownEndpoints: vi.fn(),
}));

vi.mock("~/config", () => ({
  cytarioConfig: {
    endpoints: { webapp: "https://app.example.com" },
    auth: {
      clientId: "test-client-id",
      scopes: ["openid", "profile", "organization"],
    },
  },
}));

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    // @ts-expect-error -- importOriginal returns unknown; spread is safe here
    ...actual,
    redirect: vi.fn(
      (url, init) =>
        new Response(null, { status: 302, headers: { Location: url, ...init?.headers } }),
    ),
  };
});

const { getSession } = await import("~/.server/auth/getSession");

const authenticatedSession = () => ({
  id: "session-id-123",
  get: vi.fn((key: string) => (key === "user" ? { sub: "123", email: "test@example.com" } : null)),
});

const primeOAuthState = () => {
  (generateOAuthState as Mock).mockResolvedValue({
    state: "random-state-123",
    codeChallenge: "test-challenge",
    nonce: "test-nonce",
  });
  (getWellKnownEndpoints as Mock).mockResolvedValue({
    authorization_endpoint: "https://keycloak.example.com/auth",
  });
};

describe("refresh loader (silent re-authentication primitive)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("redirects to Keycloak with prompt=none and PKCE params", async () => {
    (getSession as Mock).mockResolvedValue(authenticatedSession());
    primeOAuthState();

    const request = new Request("http://localhost/auth/refresh?return_to=/dashboard");
    const response = await loader({ request } as LoaderFunctionArgs);

    expect(generateOAuthState).toHaveBeenCalledWith("/dashboard");
    expect(response.status).toBe(302);

    const location = response.headers.get("Location")!;
    expect(location).toContain("https://keycloak.example.com/auth");
    expect(location).toContain("prompt=none");
    expect(location).toContain("response_type=code");
    expect(location).toContain("state=random-state-123");
    expect(location).toContain("code_challenge=test-challenge");
    expect(location).toContain("code_challenge_method=S256");
    expect(location).toContain("nonce=test-nonce");
    expect(location).toContain(
      "redirect_uri=" + encodeURIComponent("https://app.example.com/auth/callback"),
    );
  });

  // `Sec-`-prefixed headers are forbidden header names the Request constructor
  // silently drops, so stub the request shape to carry Sec-Fetch-Mode.
  const requestWithFetchMode = (urlStr: string, mode: string) =>
    ({
      url: urlStr,
      headers: { get: (key: string) => (key === "Sec-Fetch-Mode" ? mode : null) },
    }) as unknown as Request;

  test("rejects cross-site subresource requests without touching the session", async () => {
    (getSession as Mock).mockResolvedValue(authenticatedSession());
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const request = requestWithFetchMode(
      "http://localhost/auth/refresh?return_to=/dashboard",
      "no-cors",
    );
    const response = await loader({ request } as LoaderFunctionArgs);

    expect(response.status).toBe(404);
    expect(getSession).not.toHaveBeenCalled();
    expect(generateOAuthState).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  test("allows top-level navigations (Sec-Fetch-Mode: navigate)", async () => {
    (getSession as Mock).mockResolvedValue(authenticatedSession());
    primeOAuthState();

    const request = requestWithFetchMode(
      "http://localhost/auth/refresh?return_to=/dashboard",
      "navigate",
    );
    const response = await loader({ request } as LoaderFunctionArgs);

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain("prompt=none");
  });

  test("validates return_to against open-redirect guard", async () => {
    (getSession as Mock).mockResolvedValue(authenticatedSession());
    primeOAuthState();

    const request = new Request(
      "http://localhost/auth/refresh?return_to=https://evil.example.com/phish",
    );
    await loader({ request } as LoaderFunctionArgs);

    expect(validateRedirectTo).toHaveBeenCalledWith("https://evil.example.com/phish");
    // Off-host target collapses to "/", so no return path is carried into state.
    expect(generateOAuthState).toHaveBeenCalledWith(undefined);
  });

  test("falls back to interactive login when no active session", async () => {
    (getSession as Mock).mockResolvedValue({ get: vi.fn(() => null) });

    const request = new Request("http://localhost/auth/refresh?return_to=/dashboard");
    const response = await loader({ request } as LoaderFunctionArgs);

    expect(generateOAuthState).not.toHaveBeenCalled();
    expect(response.headers.get("Location")).toBe(
      `/login?redirect=${encodeURIComponent("/dashboard")}`,
    );
  });

  test("falls back to interactive login when state generation fails", async () => {
    (getSession as Mock).mockResolvedValue(authenticatedSession());
    (generateOAuthState as Mock).mockRejectedValue(new Error("Redis connection failed"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const request = new Request("http://localhost/auth/refresh?return_to=/dashboard");
    const response = await loader({ request } as LoaderFunctionArgs);

    expect(response.headers.get("Location")).toBe(
      `/login?redirect=${encodeURIComponent("/dashboard")}`,
    );
    consoleSpy.mockRestore();
  });
});
