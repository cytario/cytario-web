import { getSession, getSessionData } from "../getSession";
import { sessionStorage } from "../sessionStorage";
import mock from "~/utils/__tests__/__mocks__";

vi.mock("../sessionStorage", () => ({
  sessionStorage: {
    getSession: vi.fn(),
  },
}));

describe("getSession", () => {
  const mockSession = mock.session();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sessionStorage.getSession).mockResolvedValue(mockSession);
  });

  test("calls sessionStorage.getSession", async () => {
    const request = new Request("http://localhost/test");

    await getSession(request);

    expect(sessionStorage.getSession).toHaveBeenCalledTimes(1);
  });

  test("passes null when no cookie header", async () => {
    const request = new Request("http://localhost/test");

    await getSession(request);

    expect(sessionStorage.getSession).toHaveBeenCalledWith(null);
  });

  test("returns session from sessionStorage", async () => {
    const request = new Request("http://localhost/test");

    const result = await getSession(request);

    expect(result).toBe(mockSession);
  });

  test("propagates errors from sessionStorage", async () => {
    vi.mocked(sessionStorage.getSession).mockRejectedValue(
      new Error("Session storage error")
    );

    const request = new Request("http://localhost/test");

    await expect(getSession(request)).rejects.toThrow("Session storage error");
  });
});

describe("getSessionData", () => {
  test("extracts user from session", async () => {
    const mockUser = mock.user({ sub: "user-123" });
    const session = mock.session({
      user: mockUser,
    });

    const result = await getSessionData(session);

    expect(result.user).toBe(mockUser);
  });

  test("extracts authTokens from session", async () => {
    const authTokens = {
      accessToken: "access",
      idToken: "id",
      refreshToken: "refresh",
    };
    const session = mock.session({
      authTokens,
    });

    const result = await getSessionData(session);

    expect(result.authTokens).toBe(authTokens);
  });

  test("extracts credentials from session", async () => {
    const credentials = {
      "bucket-1": mock.credentials(),
    };
    const session = mock.session({
      credentials,
    });

    const result = await getSessionData(session);

    expect(result.credentials).toBe(credentials);
  });

  test("returns empty object when credentials not set", async () => {
    const session = mock.session({
      credentials: undefined,
    });

    const result = await getSessionData(session);

    expect(result.credentials).toEqual({});
  });

  test("extracts notification from session", async () => {
    const notification = {
      message: "Test notification",
      status: "success" as const,
    };
    const session = mock.session({
      notification,
    });

    const result = await getSessionData(session);

    expect(result.notification).toBe(notification);
  });

  test("returns undefined notification when not set", async () => {
    const session = mock.session({});

    const result = await getSessionData(session);

    expect(result.notification).toBeUndefined();
  });

  test("returns all session data fields", async () => {
    const mockUser = mock.user();
    const authTokens = {
      accessToken: "access",
      idToken: "id",
      refreshToken: "refresh",
    };
    const credentials = { bucket: mock.credentials() };
    const notification = {
      message: "Info",
      status: "info" as const,
    };

    const session = mock.session({
      user: mockUser,
      authTokens,
      credentials,
      notification,
    });

    const result = await getSessionData(session);

    expect(result).toEqual({
      user: mockUser,
      authTokens,
      credentials,
      notification,
    });
  });
});
