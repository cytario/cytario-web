import { LoaderFunctionArgs } from "react-router";

import { loader } from "../callback.route";
import { exchangeAuthCode } from "~/.server/auth/exchangeAuthCode";
import { getUserInfo } from "~/.server/auth/getUserInfo";
import { validateOAuthState } from "~/.server/auth/oauthState";
import { sessionStorage } from "~/.server/auth/sessionStorage";
import { verifyIdToken } from "~/.server/auth/verifyIdToken";
import mock from "~/utils/__tests__/__mocks__";

vi.mock("~/.server/auth/exchangeAuthCode", () => ({
  exchangeAuthCode: vi.fn(),
}));

vi.mock("~/.server/auth/getUserInfo", () => ({
  getUserInfo: vi.fn(),
}));

vi.mock("~/.server/auth/oauthState", () => ({
  validateOAuthState: vi.fn(),
  validateRedirectTo: vi.fn((v?: string) => v || "/"),
}));

vi.mock("~/.server/auth/getSession", () => ({
  getSession: vi.fn(),
}));

vi.mock("~/.server/auth/sessionStorage", () => ({
  sessionStorage: {
    commitSession: vi.fn().mockResolvedValue("session-cookie"),
  },
}));

vi.mock("~/.server/auth/verifyIdToken", () => ({
  verifyIdToken: vi.fn(),
}));

vi.mock("~/config", () => ({
  cytarioConfig: {
    endpoints: { webapp: "https://app.example.com" },
    auth: { clientId: "test-client" },
  },
}));

const { getSession } = await import("~/.server/auth/getSession");

/**
 * Loader error responses use react-router's `data()` helper, which returns a
 * `DataWithResponseInit` wrapper rather than a Response. Treat the wrapper as
 * an error envelope and expose status/data for assertions.
 */
type ErrorEnvelope = { status: number; data: { error: string } };

interface ResponseInitLike {
  status?: number;
}
const isDataWithResponseInit = (
  value: unknown,
): value is { init: ResponseInitLike | null; data: unknown } =>
  typeof value === "object" &&
  value !== null &&
  "init" in value &&
  "data" in value;

const asErrorEnvelope = (value: unknown): ErrorEnvelope => {
  if (!isDataWithResponseInit(value)) {
    throw new Error(
      `Expected DataWithResponseInit, got ${JSON.stringify(value)}`,
    );
  }
  return {
    status: value.init?.status ?? 200,
    data: value.data as { error: string },
  };
};

describe("callback loader", () => {
  const mockUser = mock.user();
  const mockStateData = {
    state: "valid-state",
    redirectTo: "/dashboard",
    createdAt: Date.now(),
    codeVerifier: "test-code-verifier",
    nonce: "test-nonce-abc",
  };

  let mockSession: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSession = { get: vi.fn(), set: vi.fn() };
    vi.mocked(getSession).mockResolvedValue(mockSession as never);
    vi.mocked(validateOAuthState).mockResolvedValue(mockStateData);
    vi.mocked(exchangeAuthCode).mockResolvedValue(mock.tokenReponse());
    vi.mocked(verifyIdToken).mockResolvedValue({ nonce: "test-nonce-abc", sub: "user-123" });
    vi.mocked(getUserInfo).mockResolvedValue(mockUser);
  });

  test("successful authentication creates session and redirects", async () => {
    const request = new Request(
      "http://localhost/auth/callback?code=auth-code&state=valid-state",
    );

    const response = await loader({ request } as LoaderFunctionArgs);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(302);
    expect(exchangeAuthCode).toHaveBeenCalledWith(
      "auth-code",
      "https://app.example.com/auth/callback",
      "test-code-verifier",
    );
  });

  test("returns 400 with error data on missing code/state (no /login redirect)", async () => {
    const request = new Request("http://localhost/auth/callback");

    const result = await loader({ request } as LoaderFunctionArgs);

    expect(result).not.toBeInstanceOf(Response);
    const envelope = asErrorEnvelope(result);
    expect(envelope.status).toBe(400);
    expect(envelope.data).toEqual({
      error: "Authentication failed. Missing required parameters.",
    });
    expect(mockSession.set).not.toHaveBeenCalledWith(
      "notification",
      expect.anything(),
    );
  });

  test("returns 400 with error data on invalid state", async () => {
    vi.mocked(validateOAuthState).mockResolvedValue(null);

    const request = new Request(
      "http://localhost/auth/callback?code=auth-code&state=invalid",
    );

    const envelope = asErrorEnvelope(
      await loader({ request } as LoaderFunctionArgs),
    );

    expect(envelope.status).toBe(400);
    expect(envelope.data).toEqual({
      error: "Authentication session expired. Please try again.",
    });
  });

  test("returns 400 with error data when state is missing codeVerifier", async () => {
    vi.mocked(validateOAuthState).mockResolvedValue({
      ...mockStateData,
      codeVerifier: "",
    });

    const request = new Request(
      "http://localhost/auth/callback?code=auth-code&state=valid",
    );

    const envelope = asErrorEnvelope(
      await loader({ request } as LoaderFunctionArgs),
    );

    expect(envelope.status).toBe(400);
    expect(envelope.data).toEqual({
      error: "Authentication session invalid. Please try again.",
    });
  });

  test("returns 400 when state is missing nonce", async () => {
    vi.mocked(validateOAuthState).mockResolvedValue({
      ...mockStateData,
      nonce: "",
    });

    const request = new Request(
      "http://localhost/auth/callback?code=auth-code&state=valid",
    );

    const envelope = asErrorEnvelope(
      await loader({ request } as LoaderFunctionArgs),
    );

    expect(envelope.status).toBe(400);
  });

  test("returns 400 when ID token signature verification fails", async () => {
    vi.mocked(verifyIdToken).mockResolvedValue(null);
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const request = new Request(
      "http://localhost/auth/callback?code=auth-code&state=valid-state",
    );

    const envelope = asErrorEnvelope(
      await loader({ request } as LoaderFunctionArgs),
    );

    expect(envelope.status).toBe(400);
    expect(envelope.data).toEqual({
      error: "Authentication failed. Please try again.",
    });
    consoleSpy.mockRestore();
  });

  test("returns 400 on nonce mismatch", async () => {
    vi.mocked(verifyIdToken).mockResolvedValue({ nonce: "wrong-nonce", sub: "user-123" });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const request = new Request(
      "http://localhost/auth/callback?code=auth-code&state=valid-state",
    );

    const envelope = asErrorEnvelope(
      await loader({ request } as LoaderFunctionArgs),
    );

    expect(envelope.status).toBe(400);
    expect(envelope.data).toEqual({
      error: "Authentication failed. Please try again.",
    });
    consoleSpy.mockRestore();
  });

  test("handles authorization server errors with error page data", async () => {
    const request = new Request(
      "http://localhost/auth/callback?error=access_denied&error_description=User+denied+access",
    );

    const envelope = asErrorEnvelope(
      await loader({ request } as LoaderFunctionArgs),
    );

    expect(envelope.status).toBe(400);
    expect(envelope.data).toEqual({
      error: "User denied access",
    });
  });

  test("catches errors and returns generic error page data", async () => {
    vi.mocked(exchangeAuthCode).mockRejectedValue(
      new Error("Token exchange failed: 400"),
    );
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const request = new Request(
      "http://localhost/auth/callback?code=auth-code&state=valid-state",
    );

    const envelope = asErrorEnvelope(
      await loader({ request } as LoaderFunctionArgs),
    );

    expect(envelope.status).toBe(400);
    expect(envelope.data).toEqual({
      error: "Authentication failed. Please try again.",
    });
    consoleSpy.mockRestore();
  });

  test("uses static WEB_HOST for redirect_uri, not the request URL", async () => {
    // Simulate request arriving via reverse proxy with plain HTTP
    // (TLS terminated at Traefik, so internal request uses http://)
    const request = new Request(
      "http://internal-host:3000/auth/callback?code=auth-code&state=valid-state",
    );

    await loader({ request } as LoaderFunctionArgs);

    // exchangeAuthCode must receive the configured WEB_HOST origin,
    // NOT the internal request origin
    expect(exchangeAuthCode).toHaveBeenCalledWith(
      "auth-code",
      "https://app.example.com/auth/callback",
      "test-code-verifier",
    );
  });

  test("includes Set-Cookie header on all responses", async () => {
    const request = new Request(
      "http://localhost/auth/callback?code=auth-code&state=valid-state",
    );

    await loader({ request } as LoaderFunctionArgs);

    expect(sessionStorage.commitSession).toHaveBeenCalled();
  });

  test("failure path never redirects to /login (regression: email-verify redirect loop)", async () => {
    vi.mocked(validateOAuthState).mockResolvedValue(null);

    const request = new Request(
      "http://localhost/auth/callback?code=auth-code&state=expired",
    );

    const result = await loader({ request } as LoaderFunctionArgs);

    // Must not return a redirect Response — that's what used to loop
    // against Keycloak's live SSO session.
    expect(result).not.toBeInstanceOf(Response);
  });
});
