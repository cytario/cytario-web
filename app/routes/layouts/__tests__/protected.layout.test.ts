import { createContext } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { type SessionData } from "~/.server/auth/sessionStorage";
import mock from "~/utils/__tests__/__mocks__";
import type { LockedConnection } from "~/utils/lockedConnection";

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

interface ContextOverrides {
  lockedConnections?: LockedConnection[];
  credentials?: Record<string, unknown>;
}

const buildContext = (user = mock.user(), overrides: ContextOverrides = {}) => ({
  get: vi.fn((ctx) => {
    if (ctx === authContext) {
      return {
        user,
        requestOrganization: user.organizations.testcorp
          ? "testcorp"
          : Object.keys(user.organizations)[0],
        connectionConfigs: [],
        credentials: overrides.credentials ?? { "test-conn": mock.credentials() },
        connectionProviders: {},
        lockedConnections: overrides.lockedConnections ?? [],
      };
    }
    return undefined;
  }),
});

const runLoader = (user = mock.user(), overrides: ContextOverrides = {}) => {
  const request = new Request("http://localhost/");
  return loader({
    request,
    params: {},
    context: buildContext(user, overrides) as never,
    pattern: "",
    url: new URL(request.url),
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
        sub: "user-123",
        organizations: {
          testcorp: {
            groups: ["testcorp/lab", "admins"],
            attributes: { subscription_status: ["active"] },
          },
        },
      }),
    );

    expect(data.identity).toEqual({
      sub: "user-123",
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
      "sub",
    ]);
  });

  test("does not leak PII or tokens to the client payload", async () => {
    const data = await runLoader();

    expect(data.identity).not.toHaveProperty("name");
    expect(data.identity).not.toHaveProperty("email");
    expect(data.identity).not.toHaveProperty("preferred_username");
    expect(data.identity).not.toHaveProperty("policy");
    expect(data).not.toHaveProperty("user");
    expect(data).not.toHaveProperty("authTokens");
  });

  test("carries the gate's locked connections to the client, call to action included", async () => {
    const locked = [
      {
        id: "conn-locked",
        message: "Upgrade plan to browse private data.",
        resolveUrl: "https://admin.cytario.com/billing",
        resolveLabel: "Upgrade plan",
      },
    ];

    const data = await runLoader(mock.user(), { lockedConnections: locked });

    expect(data.lockedConnections).toEqual(locked);
  });

  test("never ships a credential for a locked connection", async () => {
    // The payload is what reaches the browser: a key here is a key anyone can
    // read from `.data` or devtools and sign S3 requests with.
    const data = await runLoader(mock.user(), {
      credentials: { "conn-open": mock.credentials(), "conn-locked": mock.credentials() },
      lockedConnections: [{ id: "conn-locked" }],
    });

    expect(Object.keys(data.credentials)).toEqual(["conn-open"]);
    expect(data.credentials).not.toHaveProperty("conn-locked");
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
