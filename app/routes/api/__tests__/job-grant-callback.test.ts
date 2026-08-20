import { beforeEach, describe, expect, test, vi } from "vitest";

import { authContext } from "~/.server/auth/authMiddleware";
import { sessionContext } from "~/.server/auth/sessionMiddleware";
import { loader } from "~/routes/api/job-grant/callback";

const consumePendingMock = vi.hoisted(() => vi.fn());
vi.mock("~/.server/auth/jobGrantStorage", () => ({
  consumePendingSubmission: consumePendingMock,
}));

const exchangeMock = vi.hoisted(() => vi.fn());
vi.mock("~/.server/auth/exchangeAuthCodeForJobGrant", () => ({
  exchangeAuthCodeForJobGrant: exchangeMock,
}));

const getUserInfoMock = vi.hoisted(() => vi.fn());
const toIdentityMock = vi.hoisted(() => vi.fn());
vi.mock("~/.server/auth/getUserInfo", () => ({
  getUserInfo: getUserInfoMock,
  toIdentity: toIdentityMock,
}));

const withHostRequestContextMock = vi.hoisted(() => vi.fn());
vi.mock("~/.server/hostRequestContext", () => ({
  withHostRequestContext: withHostRequestContextMock,
}));

const listEndpointsMock = vi.hoisted(() => vi.fn());
vi.mock("~/.server/serverEndpointRegistry", () => ({
  serverEndpointRegistry: { list: listEndpointsMock },
}));

const PENDING = {
  pluginPath: "/api/plugin/run",
  requestBody: JSON.stringify({ applicationId: "demo-app", version: "1.0.0" }),
  returnPath: "/plugin/jobs",
  batchId: "batch-1",
  codeVerifier: "verifier-1",
};

const GRANT = { offlineSessionId: "sess-1", token: "rt-1", expiresAt: new Date() };

function buildArgs(code: string, state: string, overrides: Record<string, unknown> = {}) {
  const url = new URL(`http://localhost/api/job-grant/callback?code=${code}&state=${state}`);
  for (const [k, v] of Object.entries(overrides)) url.searchParams.set(k, String(v));
  const context = new Map();
  context.set(authContext, { authTokens: { accessToken: "at" }, user: null });
  context.set(sessionContext, { id: "sess" });
  return { request: new Request(url.toString()), context, params: {} } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  consumePendingMock.mockResolvedValue(PENDING);
  exchangeMock.mockResolvedValue(GRANT);
  getUserInfoMock.mockResolvedValue({ sub: "u1", organization: "testcorp" });
  toIdentityMock.mockReturnValue({
    sub: "u1",
    organization: "testcorp",
    groups: [],
    adminScopes: [],
    organizationAttributes: {},
  });
  // withHostRequestContext runs the callback synchronously and returns its result.
  withHostRequestContextMock.mockImplementation((_data: unknown, fn: () => unknown) => fn());
});

describe("GET /api/job-grant/callback — submit-phase failure forwarding (C-425, SRS-CY-37311)", () => {
  test("forwards the provider rejection reason to /plugin/jobs as ?message=", async () => {
    const actionMock = vi.fn(async () => {
      throw new Error("Compute provider rejected RegisterJobDefinition: VCPU 0.5 not valid");
    });
    listEndpointsMock.mockReturnValue([
      { contribution: { path: "/api/plugin/run", action: actionMock } },
    ]);

    const response = (await loader(buildArgs("code-1", "state-1"))) as Response;

    expect(response.status).toBe(302);
    const location = response.headers.get("Location") ?? "";
    expect(location).toMatch(/\/plugin\/jobs\?/);
    const params = new URL(location, "http://localhost").searchParams;
    expect(params.get("error")).toBe("submit_failed");
    expect(params.get("message")).toBe(
      "Compute provider rejected RegisterJobDefinition: VCPU 0.5 not valid",
    );
  });

  test("falls back to a bare ?error=submit_failed when the thrown error has no message", async () => {
    const actionMock = vi.fn(async () => {
      throw "not an Error object";
    });
    listEndpointsMock.mockReturnValue([
      { contribution: { path: "/api/plugin/run", action: actionMock } },
    ]);

    const response = (await loader(buildArgs("code-1", "state-1"))) as Response;

    expect(response.status).toBe(302);
    const params = new URL(response.headers.get("Location")!, "http://localhost").searchParams;
    expect(params.get("error")).toBe("submit_failed");
    expect(params.has("message")).toBe(false);
  });
});
