import { createContext } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { type SessionData } from "~/.server/auth/sessionStorage";
import mock from "~/utils/__tests__/__mocks__";

vi.mock("~/.server/auth/authMiddleware", () => ({
  authContext: createContext<Partial<SessionData>>(),
  authMiddleware: vi.fn(async (_ctx, next) => next()),
}));

vi.mock("~/routes/recent/recent.loader", () => ({
  loadRecentlyViewed: vi.fn(),
}));

vi.mock("~/routes/favorites/favorites.loader", () => ({
  loadFavorites: vi.fn(),
}));

const { authContext } = await import("~/.server/auth/authMiddleware");
const { loader } = await import("~/routes/layouts/protected.layout");
const { loadRecentlyViewed } = await import("~/routes/recent/recent.loader");
const { loadFavorites } = await import("~/routes/favorites/favorites.loader");

const buildContext = (user = mock.user()) => ({
  get: vi.fn((ctx) => {
    if (ctx === authContext) {
      return {
        user,
        connectionConfigs: [],
        credentials: { "test-conn": mock.credentials() },
      };
    }
    return undefined;
  }),
});

const runLoader = (user = mock.user()) => {
  const request = new Request("http://localhost/");
  return loader({
    request,
    params: {},
    context: buildContext(user) as never,
    unstable_pattern: "",
    unstable_url: new URL(request.url),
  });
};

describe("protected layout loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadRecentlyViewed).mockResolvedValue([]);
    vi.mocked(loadFavorites).mockResolvedValue([]);
  });

  test("returns the Identity projection", async () => {
    const data = await runLoader(
      mock.user({
        organization: "testcorp",
        organizationAttributes: { subscription_status: ["active"] },
        groups: ["testcorp/lab"],
        adminScopes: ["*"],
      }),
    );

    expect(data.identity).toEqual({
      organization: "testcorp",
      organizationAttributes: { subscription_status: ["active"] },
      groups: ["testcorp/lab"],
      adminScopes: ["*"],
    });
    // Pin the exact key-set so a regressed projection (e.g. a spread of the
    // full UserProfile) is caught even if the values happen to match.
    expect(Object.keys(data.identity).sort()).toEqual([
      "adminScopes",
      "groups",
      "organization",
      "organizationAttributes",
    ]);
  });

  test("does not leak PII or tokens to the client payload", async () => {
    const data = await runLoader();

    expect(data.identity).not.toHaveProperty("name");
    expect(data.identity).not.toHaveProperty("email");
    expect(data.identity).not.toHaveProperty("preferred_username");
    expect(data.identity).not.toHaveProperty("policy");
    expect(data.identity).not.toHaveProperty("sub");
    expect(data).not.toHaveProperty("user");
    expect(data).not.toHaveProperty("authTokens");
  });

  test("degrades to empty recents/favorites when a query rejects", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(loadRecentlyViewed).mockRejectedValue(new Error("DB connection lost"));
    vi.mocked(loadFavorites).mockRejectedValue(new Error("DB connection lost"));

    const data = await runLoader();

    expect(data.recentlyViewed).toEqual([]);
    expect(data.favorites).toEqual([]);
    consoleError.mockRestore();
  });
});
