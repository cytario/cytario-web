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

const profileFromTokenClaimsMock = vi.hoisted(() => vi.fn());
const toIdentityMock = vi.hoisted(() => vi.fn());
vi.mock("~/.server/auth/getUserInfo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/.server/auth/getUserInfo")>();
  return {
    ...actual,
    profileFromTokenClaims: profileFromTokenClaimsMock,
    toIdentity: toIdentityMock,
  };
});

const withHostRequestContextMock = vi.hoisted(() => vi.fn());
vi.mock("~/.server/hostRequestContext", () => ({
  withHostRequestContext: withHostRequestContextMock,
}));

const listEndpointsMock = vi.hoisted(() => vi.fn());
const findOrgScopedMock = vi.hoisted(() => vi.fn());
vi.mock("~/.server/serverEndpointRegistry", () => ({
  serverEndpointRegistry: { list: listEndpointsMock, findOrgScoped: findOrgScopedMock },
}));

const putBatchCredentialsMock = vi.hoisted(() => vi.fn());
const collectCredentialsIfBatchEmptyMock = vi.hoisted(() => vi.fn());
vi.mock("~/.server/auth/jobCredentialStore", () => ({
  putBatchCredentials: putBatchCredentialsMock,
  collectCredentialsIfBatchEmpty: collectCredentialsIfBatchEmptyMock,
}));

const PENDING = {
  pluginPath: "/run",
  requestBody: JSON.stringify({ applicationId: "demo-app", version: "1.0.0" }),
  returnPath: "/plugin/jobs",
  batchId: "batch-1",
  organization: "testcorp",
  codeVerifier: "verifier-1",
};

const GRANT = {
  offlineSessionId: "sess-1",
  refreshToken: "rt-1",
  accessToken: "at-1",
  accessTokenExpiresAt: new Date(),
  expiresAt: new Date(),
};

function buildArgs(code: string, state: string, overrides: Record<string, unknown> = {}) {
  const url = new URL(`http://localhost/api/job-grant/callback?code=${code}&state=${state}`);
  for (const [k, v] of Object.entries(overrides)) url.searchParams.set(k, String(v));
  const context = new Map();
  // requestOrganization is the session DEFAULT org — deliberately different
  // from PENDING.organization so the tests pin that the acting org is the
  // submission's, not the request URL's resolution.
  context.set(authContext, {
    authTokens: { accessToken: "at" },
    user: null,
    requestOrganization: "othercorp",
  });
  context.set(sessionContext, { id: "sess" });
  return { request: new Request(url.toString()), context, params: {} } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  consumePendingMock.mockResolvedValue(PENDING);
  exchangeMock.mockResolvedValue(GRANT);
  putBatchCredentialsMock.mockResolvedValue(undefined);
  collectCredentialsIfBatchEmptyMock.mockReset();
  collectCredentialsIfBatchEmptyMock.mockResolvedValue(undefined);
  profileFromTokenClaimsMock.mockReturnValue({ sub: "u1", organizations: {} });
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
  test("forwards the provider rejection reason to the submission org's jobs view", async () => {
    const actionMock = vi.fn(async () => {
      throw new Error("Compute provider rejected RegisterJobDefinition: VCPU 0.5 not valid");
    });
    findOrgScopedMock.mockReturnValue({
      contribution: { path: "/run", action: actionMock },
    });

    const response = (await loader(buildArgs("code-1", "state-1"))) as Response;

    expect(findOrgScopedMock).toHaveBeenCalledWith("/run");
    expect(putBatchCredentialsMock).toHaveBeenCalledWith(
      expect.objectContaining({ batchId: "batch-1", organization: "testcorp" }),
    );
    expect(response.status).toBe(302);
    const location = response.headers.get("Location") ?? "";
    // The org-prefixed jobs view of the SUBMISSION's org — not the session
    // default (othercorp), not a bare /plugin/jobs.
    expect(location.startsWith("/testcorp/plugin/jobs?")).toBe(true);
    expect(location).not.toContain("othercorp");
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
    findOrgScopedMock.mockReturnValue({
      contribution: { path: "/run", action: actionMock },
    });

    const response = (await loader(buildArgs("code-1", "state-1"))) as Response;

    expect(response.status).toBe(302);
    const params = new URL(response.headers.get("Location")!, "http://localhost").searchParams;
    expect(params.get("error")).toBe("submit_failed");
    expect(params.has("message")).toBe(false);
  });
});
