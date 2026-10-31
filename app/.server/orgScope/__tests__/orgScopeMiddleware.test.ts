import { createContext, type MiddlewareFunction } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { type SessionData } from "~/.server/auth/sessionStorage";
import mock from "~/utils/__tests__/__mocks__";

vi.mock("~/.server/auth/authMiddleware", () => ({
  authContext: createContext<Partial<SessionData>>(),
  authMiddleware: vi.fn(async (_args, next) => next()),
}));

vi.mock("~/.server/auth/activeOrganization.server", () => ({
  selectActiveOrganization: vi.fn(),
  UnknownOrganizationError: class extends Error {},
}));

vi.mock("~/.server/auth/sessionMiddleware", () => ({
  sessionContext: createContext<unknown>(),
}));

vi.mock("~/.server/logging", () => ({
  createLabel: () => "",
}));

// `Set-Cookie` is a forbidden header on the client-side Headers implementation
// the test environment ships, so redirect() is stubbed to expose what the
// middleware handed it.
vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    redirect: vi.fn((url: string, init?: { headers?: Record<string, string> }) => {
      const response = new Response(null, { status: 302 });
      return Object.assign(response, { url, init });
    }),
  };
});

const { authContext } = await import("~/.server/auth/authMiddleware");
const { selectActiveOrganization } = await import("~/.server/auth/activeOrganization.server");
const { sessionContext } = await import("~/.server/auth/sessionMiddleware");
const { orgScopeMiddleware } = await import("../orgScopeMiddleware");

const buildArgs = (path: string, method = "GET") => {
  const request = new Request(`http://localhost${path}`, { method });
  const session = mock.session({ user: mock.user() });
  const values = new Map<unknown, unknown>([
    [sessionContext, session],
    [
      authContext,
      {
        user: mock.user({
          organizations: {
            acme: { groups: [], attributes: {} },
            beta: { groups: [], attributes: {} },
          },
        }),
        activeOrganization: "acme",
      },
    ],
  ]);
  return {
    args: {
      request,
      url: new URL(request.url),
      params: {},
      pattern: "",
      context: { get: (key: unknown) => values.get(key), set: vi.fn() },
    },
    session,
  };
};

describe("orgScopeMiddleware", () => {
  const next = vi.fn(async () => new Response("OK"));

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(selectActiveOrganization).mockResolvedValue({
      user: mock.user({ organization: "beta" }),
      setCookie: "session=beta",
    });
  });

  test("continues when the URL org is the session org", async () => {
    const { args } = buildArgs("/acme/connections");

    const response = await orgScopeMiddleware(
      { ...args, params: { org: "acme" } } as unknown as Parameters<MiddlewareFunction>[0],
      next,
    );

    expect(await (response as Response).text()).toBe("OK");
    expect(selectActiveOrganization).not.toHaveBeenCalled();
  });

  test("switches the session and redirects when the URL names another membership", async () => {
    const { args, session } = buildArgs("/beta/abc");

    const response = await orgScopeMiddleware(
      { ...args, params: { org: "beta" } } as unknown as Parameters<MiddlewareFunction>[0],
      next,
    );

    expect(next).not.toHaveBeenCalled();
    expect(selectActiveOrganization).toHaveBeenCalledWith(session, expect.anything(), "beta");
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(302);
    expect((response as unknown as { url: string }).url).toBe("/beta/abc");
    expect((response as unknown as { init: { headers?: unknown } }).init?.headers).toEqual({
      "Set-Cookie": "session=beta",
    });
  });

  test("drops the previous org's credentials before the switch", async () => {
    const { args, session } = buildArgs("/beta/connections");

    await orgScopeMiddleware(
      { ...args, params: { org: "beta" } } as unknown as Parameters<MiddlewareFunction>[0],
      next,
    );

    expect(session.set).toHaveBeenCalledWith("credentials", {});
  });

  test("redirects a non-member org to the active org instead of erroring", async () => {
    const { args } = buildArgs("/other/admin/users?scope=lab");

    const response = await orgScopeMiddleware(
      { ...args, params: { org: "other" } } as unknown as Parameters<MiddlewareFunction>[0],
      next,
    );

    expect(next).not.toHaveBeenCalled();
    expect((response as Response).status).toBe(302);
    expect((response as unknown as { url: string }).url).toBe("/acme/admin/users?scope=lab");
  });

  test("never switches on a mutation — it redirects to the active org", async () => {
    const { args } = buildArgs("/beta/connections", "POST");

    const response = await orgScopeMiddleware(
      { ...args, params: { org: "beta" } } as unknown as Parameters<MiddlewareFunction>[0],
      next,
    );

    expect(selectActiveOrganization).not.toHaveBeenCalled();
    expect((response as unknown as { url: string }).url).toBe("/acme/connections");
  });

  test("throws when the session middleware has not run", async () => {
    const { args } = buildArgs("/acme/connections");

    await expect(
      orgScopeMiddleware(
        {
          ...args,
          params: { org: "acme" },
          context: { get: () => undefined, set: vi.fn() },
        } as unknown as Parameters<MiddlewareFunction>[0],
        next,
      ),
    ).rejects.toThrow("Session not found in context");
  });
});
