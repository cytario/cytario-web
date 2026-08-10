import { beforeEach, describe, expect, test, vi } from "vitest";

import { serverEndpointRegistry } from "~/.server/serverEndpointRegistry";
import { action, loader } from "~/routes/api/plugin.$";

// `authContext` is a real `createContext` token; the dispatch reads the
// resolved user off it after `authMiddleware` populates it. Keep the real
// token, mock only `authMiddleware` so we can assert it runs for session
// auth and is skipped for carve-outs.
const authContext = vi
  .importActual<typeof import("~/.server/auth/authMiddleware")>("~/.server/auth/authMiddleware")
  .then((m) => m.authContext);

vi.mock("~/.server/auth/authMiddleware", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/.server/auth/authMiddleware")>();
  return {
    ...actual,
    authMiddleware: vi.fn(async (_args: unknown, next: () => Promise<unknown>) => next()),
  };
});

vi.mock("~/.server/auth/getUserInfo", () => ({
  toIdentity: vi.fn((user: { sub: string; organization?: string }) => ({
    sub: user.sub,
    organization: user.organization,
    organizationAttributes: {},
    groups: [],
    adminScopes: [],
  })),
}));

vi.mock("~/.server/auth/sessionMiddleware", () => ({
  sessionMiddleware: vi.fn(),
}));

beforeEach(() => {
  serverEndpointRegistry.__reset();
  vi.clearAllMocks();
});

function buildArgs(method: string, pathname: string) {
  const ctx = new Map<unknown, unknown>();
  return {
    request: new Request(`http://localhost${pathname}`, { method }),
    params: {},
    context: {
      get: (k: unknown) => ctx.get(k),
      set: (k: unknown, v: unknown) => ctx.set(k, v),
    },
  } as unknown as Parameters<typeof loader>[0];
}

async function seedAuthUser(
  args: Parameters<typeof loader>[0],
  user: { sub?: string; organization?: string },
) {
  const token = await authContext;
  (args.context as unknown as { set: (k: unknown, v: unknown) => void }).set(token, {
    user: { sub: "test-user", ...user },
  });
}

describe("/api/plugin/* dispatch (SDS-CY-010094/010095)", () => {
  test("returns 404 JSON for an unmatched /api/plugin path", async () => {
    const response = (await loader(buildArgs("GET", "/api/plugin/nope"))) as Response;
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not Found" });
    expect(response.headers.get("Content-Type")).toBe("application/json");
  });

  test("session-auth: runs authMiddleware and passes the resolved identity to the loader", async () => {
    const { authMiddleware } = await import("~/.server/auth/authMiddleware");
    const { toIdentity } = await import("~/.server/auth/getUserInfo");
    const loaderFn = vi.fn(async () => Response.json({ ok: true }));

    serverEndpointRegistry.scopedFor("compute-plugin").register({
      path: "/api/plugin/catalog",
      auth: "session",
      loader: loaderFn,
    });

    const args = buildArgs("GET", "/api/plugin/catalog");
    await seedAuthUser(args, { organization: "testcorp" });

    const response = (await loader(args)) as Response;

    expect(authMiddleware).toHaveBeenCalledOnce();
    expect(toIdentity).toHaveBeenCalledOnce();
    expect(loaderFn).toHaveBeenCalledWith({
      request: args.request,
      params: {},
      identity: {
        sub: "test-user",
        organization: "testcorp",
        organizationAttributes: {},
        groups: [],
        adminScopes: [],
      },
    });
    expect(await response.json()).toEqual({ ok: true });
  });

  test("session-auth mutation: dispatches to the action, not the loader", async () => {
    const { authMiddleware } = await import("~/.server/auth/authMiddleware");
    const actionFn = vi.fn(async () => Response.json({ created: true }));
    const loaderFn = vi.fn(async () => Response.json({ unused: true }));

    serverEndpointRegistry.scopedFor("compute-plugin").register({
      path: "/api/plugin/run",
      auth: "session",
      loader: loaderFn,
      action: actionFn,
    });

    const args = buildArgs("POST", "/api/plugin/run");
    await seedAuthUser(args, { organization: "testcorp" });

    await action(args);

    expect(authMiddleware).toHaveBeenCalledOnce();
    expect(actionFn).toHaveBeenCalledOnce();
    expect(loaderFn).not.toHaveBeenCalled();
  });

  test("job-token carve-out: does NOT run authMiddleware; passes identity: undefined", async () => {
    const { authMiddleware } = await import("~/.server/auth/authMiddleware");
    const actionFn = vi.fn(async () => Response.json({ brokered: true }));

    serverEndpointRegistry.scopedFor("compute-plugin").register({
      path: "/api/plugin/credential-broker",
      auth: "job-token",
      action: actionFn,
    });

    const args = buildArgs("POST", "/api/plugin/credential-broker");
    const response = (await action(args)) as Response;

    expect(authMiddleware).not.toHaveBeenCalled();
    expect(actionFn).toHaveBeenCalledWith({
      request: args.request,
      params: {},
      identity: undefined,
    });
    expect(await response.json()).toEqual({ brokered: true });
  });

  test("webhook-secret carve-out: loader runs outside the session gate", async () => {
    const { authMiddleware } = await import("~/.server/auth/authMiddleware");
    const loaderFn = vi.fn(async () => Response.json({ cached: true }));

    serverEndpointRegistry.scopedFor("compute-plugin").register({
      path: "/api/plugin/catalog-cache-webhook",
      auth: "webhook-secret",
      loader: loaderFn,
    });

    await loader(buildArgs("GET", "/api/plugin/catalog-cache-webhook"));

    expect(authMiddleware).not.toHaveBeenCalled();
    expect(loaderFn).toHaveBeenCalledWith(expect.objectContaining({ identity: undefined }));
  });

  test("deployment-secret carve-out: action runs outside the session gate", async () => {
    const { authMiddleware } = await import("~/.server/auth/authMiddleware");
    const actionFn = vi.fn(async () => Response.json({ reconciled: true }));

    serverEndpointRegistry.scopedFor("compute-plugin").register({
      path: "/api/plugin/job-reconciliation",
      auth: "deployment-secret",
      action: actionFn,
    });

    await action(buildArgs("POST", "/api/plugin/job-reconciliation"));

    expect(authMiddleware).not.toHaveBeenCalled();
    expect(actionFn).toHaveBeenCalledOnce();
  });

  test("GET on an endpoint with only an action returns 404 (no loader)", async () => {
    serverEndpointRegistry.scopedFor("compute-plugin").register({
      path: "/api/plugin/action-only",
      auth: "job-token",
      action: async () => Response.json({ ok: true }),
    });

    const response = (await loader(buildArgs("GET", "/api/plugin/action-only"))) as Response;
    expect(response.status).toBe(404);
  });
});
