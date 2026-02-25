import { LoaderFunctionArgs } from "react-router";

import { loader } from "../callback.route";
import { exchangeAuthCode } from "~/.server/auth/exchangeAuthCode";
import { getUserInfo } from "~/.server/auth/getUserInfo";
import { validateOAuthState } from "~/.server/auth/oauthState";
import { sessionStorage } from "~/.server/auth/sessionStorage";
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

vi.mock("~/config", () => ({
  cytarioConfig: {
    endpoints: { webapp: "https://app.example.com" },
    auth: { clientId: "test-client" },
  },
}));

const { getSession } = await import("~/.server/auth/getSession");

/**
 * Helper to create a valid JWT-like token with a nonce in the payload
 */
const createIdToken = (nonce: string): string => {
  const header = Buffer.from(JSON.stringify({ alg: "RS256" })).toString(
    "base64url",
  );
  const payload = Buffer.from(
    JSON.stringify({ sub: "user-123", nonce }),
  ).toString("base64url");
  return `${header}.${payload}.fake-signature`;
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
    vi.mocked(exchangeAuthCode).mockResolvedValue({
      ...mock.tokenReponse(),
      id_token: createIdToken("test-nonce-abc"),
    });
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

  test("redirects to login with flash on missing code/state", async () => {
    const request = new Request("http://localhost/auth/callback");

    const response = await loader({ request } as LoaderFunctionArgs);

    expect((response as Response).status).toBe(302);
    expect(mockSession.set).toHaveBeenCalledWith("notification", {
      status: "error",
      message: "Authentication failed. Missing required parameters.",
    });
  });

  test("redirects to login with flash on invalid state", async () => {
    vi.mocked(validateOAuthState).mockResolvedValue(null);

    const request = new Request(
      "http://localhost/auth/callback?code=auth-code&state=invalid",
    );

    const response = await loader({ request } as LoaderFunctionArgs);

    expect((response as Response).status).toBe(302);
    expect(mockSession.set).toHaveBeenCalledWith("notification", {
      status: "error",
      message: "Authentication session expired. Please try again.",
    });
  });

  test("redirects to login when state is missing codeVerifier", async () => {
    vi.mocked(validateOAuthState).mockResolvedValue({
      ...mockStateData,
      codeVerifier: "",
    });

    const request = new Request(
      "http://localhost/auth/callback?code=auth-code&state=valid",
    );

    const response = await loader({ request } as LoaderFunctionArgs);

    expect((response as Response).status).toBe(302);
    expect(mockSession.set).toHaveBeenCalledWith("notification", {
      status: "error",
      message: "Authentication session invalid. Please try again.",
    });
  });

  test("redirects to login when state is missing nonce", async () => {
    vi.mocked(validateOAuthState).mockResolvedValue({
      ...mockStateData,
      nonce: "",
    });

    const request = new Request(
      "http://localhost/auth/callback?code=auth-code&state=valid",
    );

    const response = await loader({ request } as LoaderFunctionArgs);

    expect((response as Response).status).toBe(302);
  });

  test("redirects to login on nonce mismatch", async () => {
    vi.mocked(exchangeAuthCode).mockResolvedValue({
      ...mock.tokenReponse(),
      id_token: createIdToken("wrong-nonce"),
    });

    const request = new Request(
      "http://localhost/auth/callback?code=auth-code&state=valid-state",
    );
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await loader({ request } as LoaderFunctionArgs);

    expect((response as Response).status).toBe(302);
    expect(mockSession.set).toHaveBeenCalledWith("notification", {
      status: "error",
      message: "Authentication failed. Please try again.",
    });
    consoleSpy.mockRestore();
  });

  test("handles authorization server errors with flash notification", async () => {
    const request = new Request(
      "http://localhost/auth/callback?error=access_denied&error_description=User+denied+access",
    );

    const response = await loader({ request } as LoaderFunctionArgs);

    expect((response as Response).status).toBe(302);
    expect(mockSession.set).toHaveBeenCalledWith("notification", {
      status: "error",
      message: "User denied access",
    });
  });

  test("catches errors and shows generic message", async () => {
    vi.mocked(exchangeAuthCode).mockRejectedValue(
      new Error("Token exchange failed: 400"),
    );
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const request = new Request(
      "http://localhost/auth/callback?code=auth-code&state=valid-state",
    );

    const response = await loader({ request } as LoaderFunctionArgs);

    expect((response as Response).status).toBe(302);
    expect(mockSession.set).toHaveBeenCalledWith("notification", {
      status: "error",
      message: "Authentication failed. Please try again.",
    });
    consoleSpy.mockRestore();
  });

  test("includes Set-Cookie header on all responses", async () => {
    const request = new Request(
      "http://localhost/auth/callback?code=auth-code&state=valid-state",
    );

    await loader({ request } as LoaderFunctionArgs);

    expect(sessionStorage.commitSession).toHaveBeenCalled();
  });
});
