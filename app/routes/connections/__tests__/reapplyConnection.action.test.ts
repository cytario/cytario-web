import { describe, expect, test, vi } from "vitest";

import { authContext } from "~/.server/auth/authMiddleware";
import { sessionContext } from "~/.server/auth/sessionMiddleware";
import { prisma } from "~/.server/db/prisma";
import { applyGrantsAndRecordStatus } from "~/routes/connections/connectionGrant.server";
import { reapplyAction } from "~/routes/connections/reapplyConnection.action";
import mock from "~/utils/__tests__/__mocks__";

vi.mock("~/.server/db/prisma", () => ({
  prisma: {
    connectionConfig: {
      findFirst: vi.fn(),
      findMany: vi.fn(async () => []),
      update: vi.fn(),
    },
  },
}));
vi.mock("~/.server/db/redis", () => ({ redis: {} }));
vi.mock("~/.server/auth/sessionStorage", () => ({
  sessionStorage: { commitSession: vi.fn(async () => "cookie") },
}));
vi.mock("~/routes/connections/connectionGrant.server", async () => {
  const actual = await vi.importActual<
    typeof import("~/routes/connections/connectionGrant.server")
  >("~/routes/connections/connectionGrant.server");
  return {
    ...actual,
    applyGrantsAndRecordStatus: vi.fn(async () => ({ status: "applied", result: {} })),
  };
});

function buildArgs(user: ReturnType<typeof mock.user>, form: Record<string, string>) {
  const ctx = new Map<unknown, unknown>();
  ctx.set(authContext, { user });
  ctx.set(sessionContext, mock.session({ authTokens: { idToken: "tok" } as never }));
  const request = new Request("http://localhost/connections", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form).toString(),
  });
  return {
    request,
    params: {},
    context: { get: (k: unknown) => ctx.get(k), set: (k: unknown, v: unknown) => ctx.set(k, v) },
  } as unknown as Parameters<typeof reapplyAction>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("reapplyAction", () => {
  test("re-applies a group-scoped connection the user administers", async () => {
    const config = mock.connectionConfig({
      grants: [mock.connectionGrant({ scope: "org1/lab", providerRoleId: "pr-mock" })],
    });
    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(config);

    const user = mock.user({ adminScopes: ["org1/lab"], groups: ["org1/lab"] });
    const result = await reapplyAction(buildArgs(user, { connectionName: config.name }));

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(302);
    expect(applyGrantsAndRecordStatus).toHaveBeenCalledWith(config, {
      user,
      idToken: "tok",
      accessToken: "",
    });
  });

  test("403s when the user cannot modify the connection", async () => {
    const config = mock.connectionConfig({
      grants: [mock.connectionGrant({ scope: "org1/ops", providerRoleId: "pr-mock" })],
    });
    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(config);

    const user = mock.user({ adminScopes: [], groups: ["org1/ops"] });
    const response = await reapplyAction(buildArgs(user, { connectionName: config.name })).catch(
      (e: unknown) => e,
    );

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(403);
    expect(applyGrantsAndRecordStatus).not.toHaveBeenCalled();
  });

  test("403s on a group-scoped connection whose scope the admin does not cover", async () => {
    const config = mock.connectionConfig({
      grants: [mock.connectionGrant({ scope: "org1/ops", providerRoleId: "pr-mock" })],
    });
    vi.mocked(prisma.connectionConfig.findFirst).mockResolvedValue(config);

    const user = mock.user({ adminScopes: ["org1/lab"], groups: [] });
    const response = await reapplyAction(buildArgs(user, { connectionName: config.name })).catch(
      (e: unknown) => e,
    );

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(403);
  });

  test("requires a connection name", async () => {
    const result = await reapplyAction(buildArgs(mock.user(), {}));
    expect(result).toEqual({ error: "Connection name is required" });
  });
});
