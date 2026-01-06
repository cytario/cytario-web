import { redirect } from "react-router";

import { getSession, getSessionData } from "../getSession";
import { redirectIfAuthenticated } from "../redirectIfAuthenticated";
import mock from "~/utils/__tests__/__mocks__";

vi.mock("../getSession", () => ({
  getSession: vi.fn(),
  getSessionData: vi.fn(),
}));

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    redirect: vi.fn((url) => {
      const error = new Response(null, { status: 302 });
      (error as Response & { url: string }).url = url;
      throw error;
    }),
  };
});

describe("redirectIfAuthenticated", () => {
  const mockSession = mock.session();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue(mockSession);
  });

  test("redirects to /profile when user is authenticated", async () => {
    vi.mocked(getSessionData).mockResolvedValue({
      user: mock.user(),
      authTokens: {
        accessToken: "token",
        idToken: "id-token",
        refreshToken: "refresh",
      },
      credentials: {},
      notification: undefined,
    });

    const request = new Request("http://localhost/login");

    await expect(
      redirectIfAuthenticated({ request } as Parameters<
        typeof redirectIfAuthenticated
      >[0])
    ).rejects.toThrow();

    expect(redirect).toHaveBeenCalledWith("/profile");
  });

  test("does not redirect when user is not authenticated", async () => {
    vi.mocked(getSessionData).mockResolvedValue({
      user: undefined,
      authTokens: undefined,
      credentials: {},
      notification: undefined,
    });

    const request = new Request("http://localhost/login");

    const result = await redirectIfAuthenticated({ request } as Parameters<
      typeof redirectIfAuthenticated
    >[0]);

    expect(result).toBeUndefined();
    expect(redirect).not.toHaveBeenCalled();
  });

  test("retrieves session from request", async () => {
    vi.mocked(getSessionData).mockResolvedValue({
      user: undefined,
      authTokens: undefined,
      credentials: {},
      notification: undefined,
    });

    const request = new Request("http://localhost/login");

    await redirectIfAuthenticated({ request } as Parameters<
      typeof redirectIfAuthenticated
    >[0]);

    expect(getSession).toHaveBeenCalledWith(request);
  });

  test("calls getSessionData with session", async () => {
    vi.mocked(getSessionData).mockResolvedValue({
      user: undefined,
      authTokens: undefined,
      credentials: {},
      notification: undefined,
    });

    const request = new Request("http://localhost/login");

    await redirectIfAuthenticated({ request } as Parameters<
      typeof redirectIfAuthenticated
    >[0]);

    expect(getSessionData).toHaveBeenCalledWith(mockSession);
  });
});
