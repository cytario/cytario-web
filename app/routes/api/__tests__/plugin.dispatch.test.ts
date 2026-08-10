import { beforeEach, describe, expect, test, vi } from "vitest";

import { hostRequestStorage } from "~/.server/hostRequestContext";
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

// `verifyJobToken` is mocked so the dispatch test never hits the network.
// Each test sets `verifyJobToken` to return a verified payload or null.
const verifyJobTokenMock = vi.hoisted(() => vi.fn());
vi.mock("~/.server/auth/verifyJobToken", () => ({
  verifyJobToken: verifyJobTokenMock,
}));

const VALID_JOB_TOKEN_PAYLOAD = {
  sub: "submitting-user-42",
  organization: { testcorp: { id: "org-1", groups: [] } },
};

beforeEach(() => {
  serverEndpointRegistry.__reset();
  vi.clearAllMocks();
  verifyJobTokenMock.mockReset();
});

function buildArgs(method: string, pathname: string, init?: { headers?: Record<string, string> }) {
  const ctx = new Map<unknown, unknown>();
  return {
    request: new Request(`http://localhost${pathname}`, {
      method,
      headers: init?.headers,
    }),
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

  test("job-token carve-out: verifies the bearer token and derives identity from its claims (no session) (SRS-CY-416102(b))", async () => {
    const { authMiddleware } = await import("~/.server/auth/authMiddleware");
    const actionFn = vi.fn(async () => Response.json({ brokered: true }));

    serverEndpointRegistry.scopedFor("compute-plugin").register({
      path: "/api/plugin/credential-broker",
      auth: "job-token",
      action: actionFn,
    });

    verifyJobTokenMock.mockResolvedValueOnce(VALID_JOB_TOKEN_PAYLOAD);

    const args = buildArgs("POST", "/api/plugin/credential-broker", {
      headers: { Authorization: "Bearer job-token-value" },
    });
    const response = (await action(args)) as Response;

    expect(authMiddleware).not.toHaveBeenCalled();
    expect(verifyJobTokenMock).toHaveBeenCalledWith("job-token-value");
    expect(actionFn).toHaveBeenCalledOnce();
    expect(actionFn).toHaveBeenCalledWith({
      request: args.request,
      params: {},
      identity: {
        sub: "submitting-user-42",
        organization: "testcorp",
        organizationAttributes: {},
        groups: [],
        adminScopes: [],
      },
    });
    expect(await response.json()).toEqual({ brokered: true });
  });

  test("job-token carve-out: populates hostRequestStorage so a host capability call succeeds with no session (C-384 criterion 5)", async () => {
    let observedOrg: string | undefined;
    let observedSub: string | undefined;
    const actionFn = vi.fn(async () => {
      const data = hostRequestStorage.getStore();
      observedOrg = data?.user.organization;
      observedSub = data?.user.sub;
      return Response.json({ ok: true });
    });

    serverEndpointRegistry.scopedFor("compute-plugin").register({
      path: "/api/plugin/credential-broker",
      auth: "job-token",
      action: actionFn,
    });

    verifyJobTokenMock.mockResolvedValueOnce(VALID_JOB_TOKEN_PAYLOAD);

    const args = buildArgs("POST", "/api/plugin/credential-broker", {
      headers: { Authorization: "Bearer job-token-value" },
    });
    await action(args);

    expect(actionFn).toHaveBeenCalledOnce();
    expect(observedOrg).toBe("testcorp");
    expect(observedSub).toBe("submitting-user-42");
  });

  test("job-token carve-out: returns 401 when no bearer token is present", async () => {
    const actionFn = vi.fn(async () => Response.json({ brokered: true }));

    serverEndpointRegistry.scopedFor("compute-plugin").register({
      path: "/api/plugin/credential-broker",
      auth: "job-token",
      action: actionFn,
    });

    const response = (await action(buildArgs("POST", "/api/plugin/credential-broker"))) as Response;

    expect(response.status).toBe(401);
    expect(actionFn).not.toHaveBeenCalled();
  });

  test("job-token carve-out: returns 401 when the token fails verification (bad/expired/wrong-audience)", async () => {
    const actionFn = vi.fn(async () => Response.json({ brokered: true }));

    serverEndpointRegistry.scopedFor("compute-plugin").register({
      path: "/api/plugin/credential-broker",
      auth: "job-token",
      action: actionFn,
    });

    verifyJobTokenMock.mockResolvedValueOnce(null);

    const response = (await action(
      buildArgs("POST", "/api/plugin/credential-broker", {
        headers: { Authorization: "Bearer bad-token" },
      }),
    )) as Response;

    expect(response.status).toBe(401);
    expect(actionFn).not.toHaveBeenCalled();
  });

  test("webhook-secret carve-out: loader runs outside the session gate with an org-agnostic context", async () => {
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

  test("deployment-secret carve-out: action runs with an org-agnostic context so listAll succeeds (SRS-CY-416106)", async () => {
    const { authMiddleware } = await import("~/.server/auth/authMiddleware");
    let observedOrg: string | undefined;
    const actionFn = vi.fn(async () => {
      const data = hostRequestStorage.getStore();
      observedOrg = data?.user.organization;
      return Response.json({ reconciled: true });
    });

    serverEndpointRegistry.scopedFor("compute-plugin").register({
      path: "/api/plugin/job-reconciliation",
      auth: "deployment-secret",
      action: actionFn,
    });

    await action(buildArgs("POST", "/api/plugin/job-reconciliation"));

    expect(authMiddleware).not.toHaveBeenCalled();
    expect(actionFn).toHaveBeenCalledOnce();
    // Org-agnostic context — no organization pre-filter for the cross-org scan.
    expect(observedOrg).toBeUndefined();
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
