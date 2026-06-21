import { LoaderFunctionArgs } from "react-router";
import { Mock } from "vitest";

import { loader } from "../refresh.route";
import { getUserInfo } from "~/.server/auth/getUserInfo";
import { validateRedirectTo } from "~/.server/auth/oauthState";
import { refreshAccessTokenWithLock } from "~/.server/auth/refreshAuthTokens";
import { sessionStorage } from "~/.server/auth/sessionStorage";

vi.mock("~/.server/auth/getSession", () => ({
  getSession: vi.fn(),
}));

vi.mock("~/.server/auth/getUserInfo", () => ({
  getUserInfo: vi.fn(),
}));

vi.mock("~/.server/auth/oauthState", () => ({
  validateRedirectTo: vi.fn((v?: string) => {
    if (!v) return "/";
    return v.startsWith("/") ? v : "/";
  }),
}));

vi.mock("~/.server/auth/refreshAuthTokens", () => ({
  refreshAccessTokenWithLock: vi.fn(),
}));

vi.mock("~/.server/auth/sessionStorage", () => ({
  sessionStorage: {
    commitSession: vi.fn().mockResolvedValue("session-cookie"),
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

const buildSession = (overrides: Record<string, unknown> = {}) => {
  const store: Record<string, unknown> = {
    user: { sub: "123", email: "test@example.com" },
    authTokens: { accessToken: "old-access", refreshToken: "old-refresh", idToken: "old-id" },
    ...overrides,
  };
  return {
    id: "session-id-123",
    get: vi.fn((key: string) => store[key]),
    set: vi.fn((key: string, value: unknown) => {
      store[key] = value;
    }),
    __store: store,
  };
};

describe("refresh loader (token-refresh primitive)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("re-mints tokens, refreshes user, redirects to validated return_to", async () => {
    const session = buildSession();
    (getSession as Mock).mockResolvedValue(session);
    (refreshAccessTokenWithLock as Mock).mockResolvedValue({
      accessToken: "new-access",
      refreshToken: "new-refresh",
      idToken: "new-id",
    });
    (getUserInfo as Mock).mockResolvedValue({
      sub: "123",
      email: "test@example.com",
      organization: "acme",
    });

    const request = new Request("http://localhost/auth/refresh?return_to=/dashboard");
    const response = await loader({ request } as LoaderFunctionArgs);

    expect(refreshAccessTokenWithLock).toHaveBeenCalledWith("session-id-123", "old-refresh");
    expect(getUserInfo).toHaveBeenCalledWith("new-access");
    expect(session.set).toHaveBeenCalledWith("authTokens", {
      accessToken: "new-access",
      refreshToken: "new-refresh",
      idToken: "new-id",
    });
    expect(session.__store.user).toEqual({
      sub: "123",
      email: "test@example.com",
      organization: "acme",
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/dashboard");
    expect(sessionStorage.commitSession).toHaveBeenCalledWith(session);
  });

  test("validates return_to against open-redirect guard", async () => {
    const session = buildSession();
    (getSession as Mock).mockResolvedValue(session);
    (refreshAccessTokenWithLock as Mock).mockResolvedValue({
      accessToken: "new-access",
      refreshToken: "new-refresh",
      idToken: "new-id",
    });
    (getUserInfo as Mock).mockResolvedValue({ sub: "123" });

    const request = new Request(
      "http://localhost/auth/refresh?return_to=https://evil.example.com/phish",
    );
    const response = await loader({ request } as LoaderFunctionArgs);

    expect(validateRedirectTo).toHaveBeenCalledWith("https://evil.example.com/phish");
    expect(response.headers.get("Location")).toBe("/");
  });

  test("falls back to login when no active session", async () => {
    const session = buildSession({ user: undefined, authTokens: undefined });
    (getSession as Mock).mockResolvedValue(session);

    const request = new Request("http://localhost/auth/refresh?return_to=/dashboard");
    const response = await loader({ request } as LoaderFunctionArgs);

    expect(refreshAccessTokenWithLock).not.toHaveBeenCalled();
    expect(response.headers.get("Location")).toBe(
      `/login?redirect=${encodeURIComponent("/dashboard")}`,
    );
  });

  test("falls back to login when refresh fails", async () => {
    const session = buildSession();
    (getSession as Mock).mockResolvedValue(session);
    (refreshAccessTokenWithLock as Mock).mockRejectedValue(new Error("refresh expired"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const request = new Request("http://localhost/auth/refresh?return_to=/dashboard");
    const response = await loader({ request } as LoaderFunctionArgs);

    expect(response.headers.get("Location")).toBe(
      `/login?redirect=${encodeURIComponent("/dashboard")}`,
    );
    consoleSpy.mockRestore();
  });
});
